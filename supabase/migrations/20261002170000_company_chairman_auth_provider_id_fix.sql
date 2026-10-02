-- ============================================================================
-- CHAIRMAN AUTH PROVIDER_ID FIX
-- ----------------------------------------------------------------------------
-- Fixes public.create_chairman_auth_user, the RPC the Company portal calls
-- (script.js) before deploy_tenant_node when provisioning an institution.
--
-- Fix 1 — auth.identities.provider_id
--   The identity row's provider_id is now set to the newly created user's uid
--   (new_uid::text), matching GoTrue's convention for the 'email' provider.
--   The previous body stored p_email there, which breaks identity lookups
--   keyed by (provider, provider_id) and can collide on that unique
--   constraint when an email address is re-used after an earlier Chairman
--   account was deleted.
--
-- Fix 2 — blank email rejected
--   Blank/empty emails are rejected up front with a clear error instead of
--   creating an auth user with an unusable identity. A minimal format check
--   is applied as well.
--
-- The previous function body is not present in this repository (it exists
-- only in the live project), so this migration re-creates the function with
-- the same 4-argument signature used by script.js
--   (p_email text, p_password text, p_name text, p_school_id text) -> uuid
-- returning the new auth user id, with both fixes applied. Any pre-existing
-- overload is dropped first so a mismatched old signature cannot survive
-- alongside the fixed one. The execute-grant surface the portal needs is
-- preserved: the Company page builds its client with the anon key, so anon
-- must keep execute; authenticated and service_role are granted too.
--
-- OWNER REVIEW BEFORE RUNNING:
--   * Confirm the live function signature is (text, text, text, text) -> uuid
--     and that no additional side effects of the old body (notifications,
--     extra metadata writes) are relied upon. This re-implementation keeps
--     behavior minimal: create auth.users row + email identity, return uid.
--   * pgcrypto is required for crypt()/gen_salt(); Supabase installs it in
--     the extensions schema, which is included in this function's
--     search_path.
--   * SQL is prepared for owner review/manual execution. It has not been run
--     against Supabase as part of this change.
-- ============================================================================

begin;

-- Drop any existing overload(s) so CREATE below cannot leave a stale,
-- differently-typed version of the function behind.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'create_chairman_auth_user'
  loop
    execute format('drop function %s', r.sig);
  end loop;
end
$$;

create or replace function public.create_chairman_auth_user(
  p_email text,
  p_password text,
  p_name text,
  p_school_id text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text;
  v_name text;
  v_uid uuid;
  v_now timestamptz := now();
begin
  -- Fix 2: reject blank emails before anything is created.
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'Chairman email is required and cannot be blank.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Chairman email "%" is not a valid address.', v_email;
  end if;

  if coalesce(trim(p_password), '') = '' then
    raise exception 'Chairman password is required and cannot be blank.';
  end if;

  v_name := coalesce(nullif(trim(coalesce(p_name, '')), ''), 'Chairman');

  -- Friendly duplicate guard (auth.users.email is unique anyway).
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'An auth account already exists for %.', v_email;
  end if;

  v_uid := gen_random_uuid();

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    created_at,
    updated_at
  ) values (
    null,
    v_uid,
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf')),
    v_now,
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('name', v_name, 'schoolId', p_school_id),
    false,
    v_now,
    v_now
  );

  -- Fix 1: provider_id is the new user's uid (text), not p_email.
  -- The identities.email column is intentionally omitted from the column
  -- list: on current Supabase projects it is a generated column derived
  -- from identity_data ->> 'email', which is supplied below.
  -- identities.id is inserted as a uuid-typed value (no ::text cast): it
  -- matches current schemas where the column is uuid, and on legacy schemas
  -- where the column is text PostgreSQL applies the uuid -> text assignment
  -- cast automatically.
  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email),
    'email',
    v_uid::text,
    v_now,
    v_now,
    v_now
  );

  return v_uid;
end;
$$;

-- Preserve the execute-grant surface used by the Company portal.
revoke all on function public.create_chairman_auth_user(text, text, text, text) from public;
grant execute on function public.create_chairman_auth_user(text, text, text, text) to anon;
grant execute on function public.create_chairman_auth_user(text, text, text, text) to authenticated;
grant execute on function public.create_chairman_auth_user(text, text, text, text) to service_role;

commit;

-- ----------------------------------------------------------------------------
-- OPTIONAL POST-RUN CHECKS (read-only; run separately in the SQL editor)
-- ----------------------------------------------------------------------------
-- Verify new rows use uid as provider_id:
--
--   select i.provider, i.provider_id, i.user_id, u.email, i.created_at
--     from auth.identities i
--     join auth.users u on u.id = i.user_id
--    where i.provider = 'email'
--    order by i.created_at desc
--    limit 10;
--
-- For identities created after this fix, provider_id = user_id::text (not the
-- email). Rows created by the old body still carry provider_id = email. If
-- the owner wants to backfill them, review carefully first, e.g.:
--
--   update auth.identities i
--      set provider_id = i.user_id::text,
--          updated_at  = now()
--     from auth.users u
--    where i.user_id = u.id
--      and i.provider = 'email'
--      and i.provider_id = lower(u.email)
--      and not exists (
--        select 1 from auth.identities x
--         where x.provider = 'email'
--           and x.provider_id = i.user_id::text
--           and x.id <> i.id
--      );
--
-- The backfill above is commented out on purpose; it is not part of this
-- migration and must only run after owner review of the live data.
-- ----------------------------------------------------------------------------
