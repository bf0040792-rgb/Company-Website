-- ============================================================================
-- COREEDU.IN — COMPANY PORTAL INSTITUTION PROVISIONING
-- ----------------------------------------------------------------------------
-- DEPENDENCY: install the read-only Chairman/School reference architecture
--   20261002140000_phase_a_institution_architecture.sql
--   and the updated staff-portal RLS script before applying this Company file.
--
-- This migration does not create or change any reference tenant tables, keys,
-- academic schema, constraints, indexes, or RLS policies. The reference schema
-- already defines schools as the institution table and schools.id / schoolId as
-- the tenant key. It adds the institution type to the Company's existing public
-- registration-request tables, plus narrowly authorized RPCs for institution
-- provisioning, registry reads, and Chairman access management.
--
-- SQL is prepared for manual review/execution by the project owner; it has not
-- been run against Supabase by this change.
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

-- A small preflight lets the browser refuse provisioning before it creates an
-- Auth user if the required Company Portal RPC migration has not been applied.
-- Only the existing global Company roles can pass this check.
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
grant execute on function public.company_institution_setup_ready() to authenticated;

-- Check a proposed ID without granting the browser cross-tenant SELECT access
-- to public.schools. This intentionally reveals only whether that one ID is
-- available, and only to an authorized Company account.
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
grant execute on function public.company_institution_id_available(text) to authenticated;

-- Registry RPC returns only the institution fields used by Company Portal and
-- a minimal Chairman summary. It does not expose passwords or student/staff
-- rows and does not add a cross-tenant RLS policy.
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
        'academic_config', case when s."institution_type" = 'college' then
          jsonb_build_object(
            'version', coalesce(to_jsonb(s)->'academic_config'->'version', '1'::jsonb),
            'mode', 'college',
            'academicSession', coalesce(
              (select jsonb_build_object(
                 'name', a.name,
                 'startDate', a."startDate",
                 'endDate', a."endDate",
                 'isCurrent', a."isCurrent"
               )
               from public.academic_sessions a
               where a."schoolId" = s.id
               order by a."isCurrent" desc, a.name desc
               limit 1),
              to_jsonb(s)->'academic_config'->'academicSession'
            ),
            'college', jsonb_build_object(
              'departments', coalesce(
                (select jsonb_agg(
                   jsonb_build_object(
                     'id', d.id,
                     'name', d.name,
                     'code', d.code,
                     'programs', coalesce(
                       (select jsonb_agg(
                          jsonb_build_object(
                            'id', p.id,
                            'name', p.name,
                            'code', p.code,
                            'levelType', p."levelType",
                            'levelCount', coalesce((select count(*) from public.academic_levels level_rows
                                                     where level_rows."schoolId" = s.id
                                                       and level_rows."programId" = p.id), 0),
                            'duration', greatest(
                              coalesce(p.duration, 0),
                              coalesce((select count(*) from public.academic_levels al
                                         where al."schoolId" = s.id
                                           and al."programId" = p.id), 0)
                            ),
                            'sections', coalesce(
                              (select jsonb_agg(section_rows.name order by section_rows.name)
                                 from (select distinct sec.name
                                         from public.sections sec
                                        where sec."schoolId" = s.id
                                          and sec."programId" = p.id) as section_rows),
                              '[]'::jsonb
                            )
                          ) order by p.name
                        )
                        from public.programs p
                        where p."schoolId" = s.id
                          and p."departmentId" = d.id),
                       '[]'::jsonb
                     )
                   ) order by d.name
                 )
                 from public.departments d
                 where d."schoolId" = s.id),
                to_jsonb(s)->'academic_config'->'college'->'departments',
                '[]'::jsonb
              )
            )
          )
        else
          jsonb_build_object(
            'version', coalesce(to_jsonb(s)->'academic_config'->'version', '1'::jsonb),
            'mode', 'school',
            'academicSession', coalesce(
              (select jsonb_build_object(
                 'name', a.name,
                 'startDate', a."startDate",
                 'endDate', a."endDate",
                 'isCurrent', a."isCurrent"
               )
               from public.academic_sessions a
               where a."schoolId" = s.id
               order by a."isCurrent" desc, a.name desc
               limit 1),
              to_jsonb(s)->'academic_config'->'academicSession'
            ),
            'school', jsonb_build_object(
              'classes', coalesce(
                (select jsonb_agg(l.name order by l."sortOrder", l.name)
                   from public.academic_levels l
                  where l."schoolId" = s.id
                    and l."programId" is null
                    and l.kind = 'class'),
                to_jsonb(s)->'academic_config'->'school'->'classes',
                '[]'::jsonb
              ),
              'sections', coalesce(
                (select jsonb_agg(section_rows.name order by section_rows.name)
                   from (select distinct sec.name
                           from public.sections sec
                          where sec."schoolId" = s.id
                            and sec."programId" is null
                            and nullif(btrim(coalesce(sec.class, '')), '') is not null) as section_rows),
                to_jsonb(s)->'academic_config'->'school'->'sections',
                '[]'::jsonb
              ),
              'subjects', case
                when jsonb_typeof(to_jsonb(s)->'examSubjects') = 'array' then to_jsonb(s)->'examSubjects'
                else coalesce(to_jsonb(s)->'academic_config'->'school'->'subjects', '[]'::jsonb)
              end
            )
          )
        end,
        'themeColor', to_jsonb(s)->'themeColor',
        'secondaryColor', to_jsonb(s)->'secondaryColor',
        'admissionOpen', to_jsonb(s)->'admissionOpen',
        'examSubjects', to_jsonb(s)->'examSubjects',
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
grant execute on function public.company_set_chairman_access(text, text, text) to authenticated;


-- Configure one already-deployed public.schools row. Its ID is supplied by the
-- existing deploy_tenant_node RPC and is never re-generated here. Academic
-- rows use that exact same value in their "schoolId" columns.
create or replace function public.company_configure_institution(
  p_school_id          text,
  p_school_name        text,
  p_institution_type   text,
  p_institution_code   text,
  p_logo_url           text,
  p_branding           jsonb,
  p_academic_config    jsonb,
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
  v_type                    text := lower(btrim(coalesce(p_institution_type, '')));
  v_config                  jsonb := coalesce(p_academic_config, '{}'::jsonb);
  v_profile                 jsonb := coalesce(p_profile, '{}'::jsonb);
  v_school_config           jsonb;
  v_college_config          jsonb;
  v_classes                 jsonb;
  v_school_sections         jsonb;
  v_departments             jsonb;
  v_programs                jsonb;
  v_program_sections        jsonb;
  v_session_config          jsonb;
  v_subjects                jsonb;
  v_profile_row             record;
  v_class_row               record;
  v_section_row             record;
  v_department_row          record;
  v_program_row             record;
  v_session_id              text;
  v_session_name            text;
  v_session_start           date;
  v_session_end             date;
  v_school_class            text;
  v_digits                  text;
  v_level_code              text;
  v_level_name              text;
  v_level_kind              text;
  v_level_prefix            text;
  v_unit_name               text;
  v_level_id                text;
  v_existing_program_id     text;
  v_section_name            text;
  v_section_id              text;
  v_department_name         text;
  v_department_code         text;
  v_department_id           text;
  v_existing_department_id  text;
  v_program_name            text;
  v_program_code            text;
  v_program_id              text;
  v_existing_department     text;
  v_level_type              text;
  v_duration                integer;
  v_level_number            integer;
  v_profile_text            text;
  v_column_type             text;
  v_column_udt              text;
  v_current_type            text;
  v_department_count        integer := 0;
  v_program_count           integer := 0;
  v_level_count             integer := 0;
  v_section_count           integer := 0;
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
  if jsonb_typeof(v_config) <> 'object' then
    raise exception 'Academic configuration must be a JSON object';
  end if;
  if p_branding is not null and jsonb_typeof(p_branding) <> 'object' then
    raise exception 'Branding must be a JSON object';
  end if;
  if v_config ? 'mode' and v_config->>'mode' is distinct from v_type then
    raise exception 'Academic configuration mode does not match institution type';
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

  -- Changing a legacy/default school row to college is permitted during first
  -- setup. Once tenant academic/student rows exist, switching type is blocked
  -- to avoid reinterpreting or stranding existing tenant data.
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
         "academic_config" = v_config,
         "themeColor" = coalesce(nullif(btrim(coalesce(p_theme_color, '')), ''), "themeColor", '#1e3c72'),
         "admissionOpen" = coalesce(p_admission_open, true)
   where id = p_school_id;

  -- Keep legacy registration/contact fields on their existing schools columns
  -- where those columns exist. No parallel columns or replacement profile table
  -- is introduced. Unknown keys are intentionally ignored.
  for v_profile_row in
    select e.key, e.value
      from jsonb_each(v_profile) as e(key, value)
  loop
    if v_profile_row.key = any (array[
      'phone', 'altPhone', 'email', 'website', 'affiliationNo', 'board',
      'schoolType', 'country', 'state', 'district', 'pincode', 'address', 'regNo',
      'secondaryColor'
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
  -- Update only this institution's existing chairman row(s); the Auth identity
  -- and users."schoolId" are left intact.
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

  -- The school portal's existing exam setup reads schools.examSubjects. Keep
  -- that legacy surface in sync where the installed schema supports JSON/JSONB
  -- or text[]; academic_config remains the canonical new institution config.
  v_subjects := v_config #> '{school,subjects}';
  if v_type = 'school' and v_subjects is not null and jsonb_typeof(v_subjects) <> 'null' then
    if jsonb_typeof(v_subjects) <> 'array' then
      raise exception 'school.subjects must be a JSON array';
    end if;
    select c.data_type, c.udt_name
      into v_column_type, v_column_udt
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = 'schools'
       and c.column_name = 'examSubjects';

    if v_column_type = 'jsonb' then
      execute 'update public.schools set "examSubjects" = $1 where id = $2'
        using v_subjects, p_school_id;
    elsif v_column_type = 'json' then
      execute 'update public.schools set "examSubjects" = $1::json where id = $2'
        using v_subjects, p_school_id;
    elsif v_column_type = 'ARRAY' and v_column_udt = '_text' then
      execute 'update public.schools set "examSubjects" = (select coalesce(array_agg(x.value), array[]::text[]) from jsonb_array_elements_text($1) as x(value)) where id = $2'
        using v_subjects, p_school_id;
    end if;
  end if;

  -- Upsert the configured academic session by institution + case-insensitive
  -- name. This uses the Phase A academic_sessions table and shared tenant key.
  v_session_config := v_config->'academicSession';
  if v_session_config is not null and jsonb_typeof(v_session_config) not in ('object', 'null') then
    raise exception 'academicSession must be an object';
  end if;
  if jsonb_typeof(v_session_config) = 'object' then
    v_session_name := nullif(btrim(coalesce(v_session_config->>'name', '')), '');
    if v_session_name is not null then
      v_session_start := nullif(v_session_config->>'startDate', '')::date;
      v_session_end := nullif(v_session_config->>'endDate', '')::date;
      if v_session_start is not null and v_session_end is not null and v_session_end < v_session_start then
        raise exception 'Academic session end date must be on or after the start date';
      end if;

      select a.id
        into v_session_id
        from public.academic_sessions a
       where a."schoolId" = p_school_id
         and lower(a.name) = lower(v_session_name)
       limit 1;

      update public.academic_sessions
         set "isCurrent" = false
       where "schoolId" = p_school_id
         and "isCurrent" = true
         and (v_session_id is null or id <> v_session_id);

      if v_session_id is null then
        insert into public.academic_sessions ("schoolId", name, "startDate", "endDate", "isCurrent", status)
        values (p_school_id, v_session_name, v_session_start, v_session_end, true, 'active')
        returning id into v_session_id;
      else
        update public.academic_sessions
           set name = v_session_name,
               "startDate" = v_session_start,
               "endDate" = v_session_end,
               "isCurrent" = true,
               status = 'active'
         where id = v_session_id
           and "schoolId" = p_school_id;
      end if;
    end if;
  end if;

  if v_type = 'school' then
    v_school_config := coalesce(v_config->'school', '{}'::jsonb);
    if jsonb_typeof(v_school_config) <> 'object' then
      raise exception 'school academic configuration must be an object';
    end if;
    v_classes := coalesce(v_school_config->'classes', '[]'::jsonb);
    v_school_sections := coalesce(v_school_config->'sections', '[]'::jsonb);
    if jsonb_typeof(v_classes) <> 'array' then
      raise exception 'school.classes must be a JSON array';
    end if;
    if jsonb_typeof(v_school_sections) <> 'array' then
      raise exception 'school.sections must be a JSON array';
    end if;

    for v_class_row in
      select c.value, c.ordinality
        from jsonb_array_elements_text(v_classes) with ordinality as c(value, ordinality)
    loop
      v_school_class := nullif(btrim(v_class_row.value), '');
      if v_school_class is null then
        continue;
      end if;
      v_digits := regexp_replace(v_school_class, '[^0-9]', '', 'g');
      if v_digits = '' then
        v_digits := lpad(v_class_row.ordinality::text, 2, '0');
      end if;
      v_level_code := 'CLASS-' || v_digits;

      select l.id, l."programId"
        into v_level_id, v_existing_program_id
        from public.academic_levels l
       where l."schoolId" = p_school_id
         and lower(l.code) = lower(v_level_code)
       limit 1;
      if v_level_id is not null and v_existing_program_id is not null then
        raise exception 'Academic level code % is already assigned to a college program', v_level_code;
      elsif v_level_id is null then
        insert into public.academic_levels ("schoolId", name, code, kind, "sortOrder")
        values (p_school_id, v_school_class, v_level_code, 'class', v_class_row.ordinality::integer)
        returning id into v_level_id;
      else
        update public.academic_levels
           set name = v_school_class,
               kind = 'class',
               "sortOrder" = v_class_row.ordinality::integer,
               "departmentId" = null,
               "programId" = null
         where id = v_level_id
           and "schoolId" = p_school_id;
      end if;
      v_level_count := v_level_count + 1;

      for v_section_row in
        select distinct nullif(btrim(s.value), '') as name
          from jsonb_array_elements_text(v_school_sections) as s(value)
         where nullif(btrim(s.value), '') is not null
      loop
        select sec.id
          into v_section_id
          from public.sections sec
         where sec."schoolId" = p_school_id
           and coalesce(sec.class, '') = v_school_class
           and coalesce(sec."programId", '') = ''
           and sec."levelId" = v_level_id
           and sec.name = v_section_row.name
         limit 1;
        if v_section_id is null then
          insert into public.sections ("schoolId", "levelId", class, name, "academicSessionId")
          values (p_school_id, v_level_id, v_school_class, v_section_row.name, v_session_id);
        elsif v_session_id is not null then
          update public.sections
             set "academicSessionId" = v_session_id
           where id = v_section_id
             and "schoolId" = p_school_id;
        end if;
        v_section_count := v_section_count + 1;
      end loop;
    end loop;

  else
    v_college_config := coalesce(v_config->'college', '{}'::jsonb);
    if jsonb_typeof(v_college_config) <> 'object' then
      raise exception 'college academic configuration must be an object';
    end if;
    v_departments := coalesce(v_college_config->'departments', '[]'::jsonb);
    if jsonb_typeof(v_departments) <> 'array' then
      raise exception 'college.departments must be a JSON array';
    end if;

    for v_department_row in
      select d.value from jsonb_array_elements(v_departments) as d(value)
    loop
      if jsonb_typeof(v_department_row.value) <> 'object' then
        raise exception 'Each department must be a JSON object';
      end if;
      v_department_name := nullif(btrim(coalesce(v_department_row.value->>'name', '')), '');
      v_department_code := upper(nullif(btrim(coalesce(v_department_row.value->>'code', '')), ''));
      if v_department_name is null or v_department_code is null then
        raise exception 'Every college department requires a name and code';
      end if;

      select d.id
        into v_department_id
        from public.departments d
       where d."schoolId" = p_school_id
         and lower(d.code) = lower(v_department_code)
       limit 1;
      if v_department_id is null then
        insert into public.departments ("schoolId", name, code, status)
        values (p_school_id, v_department_name, v_department_code, 'active')
        returning id into v_department_id;
      else
        update public.departments
           set name = v_department_name
         where id = v_department_id
           and "schoolId" = p_school_id;
      end if;
      v_department_count := v_department_count + 1;

      v_programs := coalesce(v_department_row.value->'programs', '[]'::jsonb);
      if jsonb_typeof(v_programs) <> 'array' then
        raise exception 'department.programs must be a JSON array';
      end if;

      for v_program_row in
        select p.value from jsonb_array_elements(v_programs) as p(value)
      loop
        if jsonb_typeof(v_program_row.value) <> 'object' then
          raise exception 'Each program must be a JSON object';
        end if;
        v_program_name := nullif(btrim(coalesce(v_program_row.value->>'name', '')), '');
        v_program_code := upper(nullif(btrim(coalesce(v_program_row.value->>'code', '')), ''));
        v_level_type := lower(coalesce(nullif(btrim(v_program_row.value->>'levelType'), ''), 'semester'));
        v_duration := nullif(btrim(coalesce(v_program_row.value->>'duration', '')), '')::integer;
        if v_program_name is null or v_program_code is null then
          raise exception 'Every college program requires a name and code';
        end if;
        if v_level_type not in ('semester', 'year', 'trimester', 'custom') then
          raise exception 'Unsupported program levelType: %', v_level_type;
        end if;
        if v_duration is null or v_duration < 1 or v_duration > 30 then
          raise exception 'Program % must have between 1 and 30 academic levels', v_program_code;
        end if;

        select p.id, p."departmentId"
          into v_program_id, v_existing_department
          from public.programs p
         where p."schoolId" = p_school_id
           and lower(p.code) = lower(v_program_code)
         limit 1;
        if v_program_id is not null and v_duration < (
          select count(*) from public.academic_levels existing_level
           where existing_level."schoolId" = p_school_id
             and existing_level."programId" = v_program_id
        ) then
          raise exception 'Program % already has more academic levels; existing levels are retained and the count cannot be reduced', v_program_code;
        end if;
        if v_program_id is not null and exists (
          select 1 from public.academic_levels existing_level
           where existing_level."schoolId" = p_school_id
             and existing_level."programId" = v_program_id
             and existing_level.kind is distinct from case
               when v_level_type = 'custom' then 'custom'
               else v_level_type
             end
        ) then
          raise exception 'Program % level system cannot change while its academic levels exist', v_program_code;
        end if;
        if v_program_id is not null and v_existing_department <> v_department_id then
          raise exception 'Program code % is already assigned to another department', v_program_code;
        elsif v_program_id is null then
          insert into public.programs ("schoolId", "departmentId", name, code, "levelType", duration, status)
          values (p_school_id, v_department_id, v_program_name, v_program_code, v_level_type, v_duration, 'active')
          returning id into v_program_id;
        else
          update public.programs
             set name = v_program_name,
                 "levelType" = v_level_type,
                 duration = v_duration
           where id = v_program_id
             and "schoolId" = p_school_id
             and "departmentId" = v_department_id;
        end if;
        v_program_count := v_program_count + 1;

        v_program_sections := coalesce(v_program_row.value->'sections', '[]'::jsonb);
        if jsonb_typeof(v_program_sections) <> 'array' then
          raise exception 'program.sections must be a JSON array';
        end if;

        if v_level_type = 'semester' then
          v_unit_name := 'Semester';
          v_level_prefix := 'SEM';
        elsif v_level_type = 'year' then
          v_unit_name := 'Year';
          v_level_prefix := 'YEA';
        elsif v_level_type = 'trimester' then
          v_unit_name := 'Trimester';
          v_level_prefix := 'TRI';
        else
          v_unit_name := 'Level';
          v_level_prefix := 'LEV';
        end if;

        for v_level_number in 1..v_duration loop
          v_level_name := v_unit_name || ' ' || v_level_number::text;
          v_level_code := v_program_code || '-' || v_level_prefix || v_level_number::text;
          v_level_kind := case when v_level_type = 'custom' then 'custom' else v_level_type end;

          select l.id, l."programId"
            into v_level_id, v_existing_program_id
            from public.academic_levels l
           where l."schoolId" = p_school_id
             and lower(l.code) = lower(v_level_code)
           limit 1;
          if v_level_id is not null and v_existing_program_id is not null and v_existing_program_id <> v_program_id then
            raise exception 'Academic level code % is already assigned to another program', v_level_code;
          elsif v_level_id is null then
            insert into public.academic_levels ("schoolId", "departmentId", "programId", name, code, kind, "sortOrder")
            values (p_school_id, v_department_id, v_program_id, v_level_name, v_level_code, v_level_kind, v_level_number)
            returning id into v_level_id;
          else
            update public.academic_levels
               set "departmentId" = v_department_id,
                   "programId" = v_program_id,
                   name = v_level_name,
                   kind = v_level_kind,
                   "sortOrder" = v_level_number
             where id = v_level_id
               and "schoolId" = p_school_id;
          end if;
          v_level_count := v_level_count + 1;

          for v_section_row in
            select distinct nullif(btrim(s.value), '') as name
              from jsonb_array_elements_text(v_program_sections) as s(value)
             where nullif(btrim(s.value), '') is not null
          loop
            select sec.id
              into v_section_id
              from public.sections sec
             where sec."schoolId" = p_school_id
               and coalesce(sec.class, '') = ''
               and sec."programId" = v_program_id
               and sec."levelId" = v_level_id
               and sec.name = v_section_row.name
             limit 1;
            if v_section_id is null then
              insert into public.sections ("schoolId", "levelId", "programId", class, name, "academicSessionId")
              values (p_school_id, v_level_id, v_program_id, null, v_section_row.name, v_session_id);
            elsif v_session_id is not null then
              update public.sections
                 set "academicSessionId" = v_session_id
               where id = v_section_id
                 and "schoolId" = p_school_id;
            end if;
            v_section_count := v_section_count + 1;
          end loop;
        end loop;
      end loop;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'school_id', p_school_id,
    'institution_type', v_type,
    'academic_session_id', v_session_id,
    'departments_configured', v_department_count,
    'programs_configured', v_program_count,
    'levels_configured', v_level_count,
    'sections_configured', v_section_count
  );
end;
$$;

revoke all on function public.company_configure_institution(text, text, text, text, text, jsonb, jsonb, jsonb, text, boolean) from public;
grant execute on function public.company_configure_institution(text, text, text, text, text, jsonb, jsonb, jsonb, text, boolean) to authenticated;

-- Make the new RPC visible to PostgREST without changing tenant policies.
select pg_notify('pgrst', 'reload schema');

commit;

-- ============================================================================
-- END — no Supabase SQL was executed while preparing this migration.
-- ============================================================================
