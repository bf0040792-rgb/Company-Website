-- ============================================================================
-- COREEDU.IN — COMPANY PORTAL INSTITUTION PROVISIONING
-- ----------------------------------------------------------------------------
-- DEPENDENCY: install the read-only Chairman/School reference architecture
--   20261002140000_phase_a_institution_architecture.sql
--   and the updated staff-portal RLS script before applying this Company file.
--
-- Company provisions an institution identity and its basic settings only.
-- Classes, departments, HODs, programs, and staff remain institution-managed
-- from the Chairman/Principal portal and are not created or modified here.
-- The existing public.schools row remains the institution; schools.id and
-- users.schoolId remain the shared tenant key. No RLS policy is added/changed.
--
-- provider_id is intentionally neither created nor updated here. Confirm the
-- existing deploy_tenant_node RPC's provider relationship against the live
-- schema before manual execution; this migration does not guess its semantics.
--
-- SQL is prepared for owner review/manual execution. It has not been run against
-- Supabase as part of this change.
-- ============================================================================

begin;

-- Public registration requests are Company workflow data, not tenant records.
-- Keep the selected School/College type with a default that preserves older
-- school-only requests; no access policy is added or changed here.
alter table public.pending_registrations
  add column if not exists institution_type text;
alter table public.accepted_registrations
  add column if not exists institution_type text;

alter table public.pending_registrations
  alter column institution_type set default 'school';
alter table public.accepted_registrations
  alter column institution_type set default 'school';

update public.pending_registrations
   set institution_type = 'school'
 where institution_type is null
    or institution_type not in ('school', 'college');
update public.accepted_registrations
   set institution_type = 'school'
 where institution_type is null
    or institution_type not in ('school', 'college');

alter table public.pending_registrations
  alter column institution_type set not null;
alter table public.accepted_registrations
  alter column institution_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.pending_registrations'::regclass
       and conname = 'pending_registrations_institution_type_check'
  ) then
    alter table public.pending_registrations
      add constraint pending_registrations_institution_type_check
      check (institution_type in ('school', 'college'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.accepted_registrations'::regclass
       and conname = 'accepted_registrations_institution_type_check'
  ) then
    alter table public.accepted_registrations
      add constraint accepted_registrations_institution_type_check
      check (institution_type in ('school', 'college'));
  end if;
end
$$;

comment on column public.pending_registrations.institution_type is
  'Company registration workflow type: school or college.';
comment on column public.accepted_registrations.institution_type is
  'Company registration workflow type: school or college.';

-- Role check shared by every Company RPC. SECURITY DEFINER is used only inside
-- these RPCs; it does not grant cross-tenant table access to browser sessions.
create or replace function public.company_institution_setup_ready()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
       from public.users u
       where u.id = (select auth.uid())::text
         and lower(coalesce(u.role, '')) in ('developer', 'admin', 'superadmin', 'root')
     );
$$;

revoke all on function public.company_institution_setup_ready() from public;
revoke execute on function public.company_institution_setup_ready() from anon;
grant execute on function public.company_institution_setup_ready() to authenticated;

-- Check a proposed ID without granting browser SELECT access to schools.
-- This reveals only whether the supplied ID is available to an authorized
-- Company account.
create or replace function public.company_institution_id_available(p_school_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.company_institution_setup_ready() then
    raise exception 'Company administrator authorization required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_school_id, '')), '') is null then
    raise exception 'Institution ID is required';
  end if;
  return not exists (select 1 from public.schools s where s.id = p_school_id);
end;
$$;

revoke all on function public.company_institution_id_available(text) from public;
revoke execute on function public.company_institution_id_available(text) from anon;
grant execute on function public.company_institution_id_available(text) to authenticated;

-- Return only the institution-level fields used by Company Portal and a
-- minimal Chairman summary. Passwords, academic records, and staff/student rows
-- are not returned. Tenant academic data remains managed under reference RLS.
create or replace function public.company_list_institutions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.company_institution_setup_ready() then
    raise exception 'Company administrator authorization required' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'schoolName', s."schoolName",
        'institution_type', s."institution_type",
        'institution_code', s."institution_code",
        'logoUrl', s."logoUrl",
        'branding', s."branding",
        'themeColor', to_jsonb(s)->'themeColor',
        'secondaryColor', to_jsonb(s)->'secondaryColor',
        'admissionOpen', to_jsonb(s)->'admissionOpen',
        'phone', to_jsonb(s)->'phone',
        'altPhone', to_jsonb(s)->'altPhone',
        'email', to_jsonb(s)->'email',
        'contactEmail', to_jsonb(s)->'contactEmail',
        'website', to_jsonb(s)->'website',
        'affiliationNo', to_jsonb(s)->'affiliationNo',
        'schoolType', to_jsonb(s)->'schoolType',
        'board', to_jsonb(s)->'board',
        'country', to_jsonb(s)->'country',
        'state', to_jsonb(s)->'state',
        'district', to_jsonb(s)->'district',
        'pincode', to_jsonb(s)->'pincode',
        'address', to_jsonb(s)->'address',
        'regNo', to_jsonb(s)->'regNo',
        'chairman', (
          select jsonb_build_object(
            'id', u.id,
            'schoolId', u."schoolId",
            'name', u.name,
            'email', u.email,
            'role', u.role,
            'staffRole', to_jsonb(u)->'staffRole',
            'status', to_jsonb(u)->'status',
            'blockReason', to_jsonb(u)->'blockReason'
          )
          from public.users u
          where u."schoolId" = s.id
            and u.role = 'chairman'
          order by u.id
          limit 1
        )
      ) order by lower(coalesce(s."schoolName", s.id))
    ),
    '[]'::jsonb
  )
    into v_result
    from public.schools s;

  return v_result;
end;
$$;

revoke all on function public.company_list_institutions() from public;
revoke execute on function public.company_list_institutions() from anon;
grant execute on function public.company_list_institutions() to authenticated;

-- Chairman activation/deactivation is narrowly scoped to the requested
-- institution and role; no user-management RLS policy is broadened.
create or replace function public.company_set_chairman_access(
  p_school_id text,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_reason text;
  v_updated integer := 0;
begin
  if not public.company_institution_setup_ready() then
    raise exception 'Company administrator authorization required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_school_id, '')), '') is null then
    raise exception 'Institution ID is required';
  end if;
  if v_status not in ('active', 'blocked') then
    raise exception 'Chairman status must be active or blocked';
  end if;
  if not exists (select 1 from public.schools s where s.id = p_school_id) then
    raise exception 'Institution % does not exist', p_school_id;
  end if;

  v_reason := case when v_status = 'blocked'
    then coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Institution access deactivated by Company Admin')
    else ''
  end;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'users' and column_name = 'blockReason'
  ) then
    execute 'update public.users set status = $1, "blockReason" = $2 where "schoolId" = $3 and role = ''chairman'''
      using v_status, v_reason, p_school_id;
  else
    execute 'update public.users set status = $1 where "schoolId" = $2 and role = ''chairman'''
      using v_status, p_school_id;
  end if;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'No Chairman account is linked to institution %', p_school_id;
  end if;

  return jsonb_build_object('ok', true, 'school_id', p_school_id, 'status', v_status, 'chairmen_updated', v_updated);
end;
$$;

revoke all on function public.company_set_chairman_access(text, text, text) from public;
revoke execute on function public.company_set_chairman_access(text, text, text) from anon;
grant execute on function public.company_set_chairman_access(text, text, text) to authenticated;

-- Remove the earlier unexecuted provisioning-draft signature before installing
-- the institution-only configuration RPC. No academic data is deleted or edited.
drop function if exists public.company_configure_institution(text, text, text, text, text, jsonb, jsonb, jsonb, text, boolean);

create or replace function public.company_configure_institution(
  p_school_id          text,
  p_school_name        text,
  p_institution_type   text,
  p_institution_code   text,
  p_logo_url           text,
  p_branding           jsonb,
  p_profile            jsonb,
  p_theme_color        text,
  p_admission_open     boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := lower(btrim(coalesce(p_institution_type, '')));
  v_profile jsonb := coalesce(p_profile, '{}'::jsonb);
  v_profile_row record;
  v_profile_text text;
  v_column_type text;
  v_current_type text;
begin
  if not public.company_institution_setup_ready() then
    raise exception 'Company administrator authorization required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_school_id, '')), '') is null then
    raise exception 'Institution ID is required';
  end if;
  if nullif(btrim(coalesce(p_school_name, '')), '') is null then
    raise exception 'Institution name is required';
  end if;
  if v_type not in ('school', 'college') then
    raise exception 'Institution type must be school or college';
  end if;
  if p_branding is not null and jsonb_typeof(p_branding) <> 'object' then
    raise exception 'Branding must be a JSON object';
  end if;
  if jsonb_typeof(v_profile) <> 'object' then
    raise exception 'Institution profile must be a JSON object';
  end if;

  select s."institution_type"
    into v_current_type
    from public.schools s
   where s.id = p_school_id
   for update;
  if not found then
    raise exception 'Institution % does not exist; deploy it through the existing tenant provisioning RPC first', p_school_id;
  end if;

  -- The UI keeps type stable. Enforce the same invariant server-side after any
  -- tenant academic/student rows exist, without writing those rows here.
  if coalesce(v_current_type, 'school') is distinct from v_type
     and (
       exists (select 1 from public.students st where st."schoolId" = p_school_id)
       or exists (select 1 from public.departments d where d."schoolId" = p_school_id)
       or exists (select 1 from public.programs pr where pr."schoolId" = p_school_id)
       or exists (select 1 from public.academic_sessions a where a."schoolId" = p_school_id)
       or exists (select 1 from public.academic_levels l where l."schoolId" = p_school_id)
       or exists (select 1 from public.sections sec where sec."schoolId" = p_school_id)
     ) then
    raise exception 'Institution type cannot be changed after academic or student data exists';
  end if;

  update public.schools
     set "schoolName" = btrim(p_school_name),
         "institution_type" = v_type,
         "institution_code" = nullif(btrim(coalesce(p_institution_code, '')), ''),
         "logoUrl" = nullif(btrim(coalesce(p_logo_url, '')), ''),
         "branding" = coalesce(p_branding, '{}'::jsonb),
         "themeColor" = coalesce(nullif(btrim(coalesce(p_theme_color, '')), ''), "themeColor", '#1e3c72'),
         "admissionOpen" = coalesce(p_admission_open, true)
   where id = p_school_id;

  -- Persist known registration/contact values only when the corresponding
  -- existing schools column is textual. No replacement profile table/column is
  -- introduced; unknown keys are intentionally ignored.
  for v_profile_row in
    select e.key, e.value
      from jsonb_each(v_profile) as e(key, value)
  loop
    if v_profile_row.key = any (array[
      'phone', 'altPhone', 'email', 'website', 'affiliationNo', 'board',
      'schoolType', 'country', 'state', 'district', 'pincode', 'address',
      'regNo', 'secondaryColor'
    ]) then
      select c.data_type
        into v_column_type
        from information_schema.columns c
       where c.table_schema = 'public'
         and c.table_name = 'schools'
         and c.column_name = v_profile_row.key;

      if v_column_type in ('text', 'character varying', 'character') then
        v_profile_text := case
          when jsonb_typeof(v_profile_row.value) = 'string' then v_profile_row.value #>> '{}'
          when jsonb_typeof(v_profile_row.value) = 'null' then null
          else v_profile_row.value::text
        end;
        execute format('update public.schools set %I = $1 where id = $2', v_profile_row.key)
          using nullif(v_profile_text, ''), p_school_id;
      end if;
    end if;
  end loop;

  -- Chairman login/profile reads schoolName and logoUrl from public.users too.
  -- Keep Auth identity and users.schoolId intact.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'users' and column_name = 'schoolName'
  ) then
    execute 'update public.users set "schoolName" = $1 where "schoolId" = $2 and role = ''chairman'''
      using btrim(p_school_name), p_school_id;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'users' and column_name = 'logoUrl'
  ) then
    execute 'update public.users set "logoUrl" = $1 where "schoolId" = $2 and role = ''chairman'''
      using nullif(btrim(coalesce(p_logo_url, '')), ''), p_school_id;
  end if;
  if v_profile->>'chairmanRole' in ('Chairman', 'Principal')
     and exists (
       select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'users' and column_name = 'staffRole'
     ) then
    execute 'update public.users set "staffRole" = $1 where "schoolId" = $2 and role = ''chairman'''
      using v_profile->>'chairmanRole', p_school_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'school_id', p_school_id,
    'institution_type', v_type
  );
end;
$$;

revoke all on function public.company_configure_institution(text, text, text, text, text, jsonb, jsonb, text, boolean) from public;
revoke execute on function public.company_configure_institution(text, text, text, text, text, jsonb, jsonb, text, boolean) from anon;
grant execute on function public.company_configure_institution(text, text, text, text, text, jsonb, jsonb, text, boolean) to authenticated;

-- Make Company RPC updates visible to PostgREST without changing tenant RLS.
select pg_notify('pgrst', 'reload schema');

commit;

-- ============================================================================
-- END — no Supabase SQL was executed while preparing this migration.
-- ============================================================================
