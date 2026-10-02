# Company Portal School / College provisioning verification

## Scope and prerequisites

This checklist covers the Company Portal wizard and registry against the reference School/Chairman tenant architecture. The reference repository is read-only; changes and the Company migration are in this repository only.

1. In the **reference School/Chairman repository**, review and manually apply its Phase A migration (`20261002140000_phase_a_institution_architecture.sql`) and the updated staff-portal RLS script (`supabase/2026-10-02_staff_portal_rls.sql`) in the project owner's chosen order. The Company migration depends on the Phase A tables and fields.
2. Manually review and apply `supabase/migrations/20261002153000_company_institution_provisioning.sql` from this repository. It adds the School/College discriminator to the existing Company registration request tables and creates tightly role-checked Company RPCs; it does not change RLS policies.
3. Sign in to the Company Portal with a `developer`, `admin`, `superadmin`, or `root` account represented in `public.users`. Confirm the existing `create_chairman_auth_user` and `deploy_tenant_node` RPCs are available. Use a non-production/test Supabase project and unique emails/passwords.

Do not run the checks below against production data unless approved by the project owner. SQL examples use `SCHOOL_ID` / `COLLEGE_ID` as placeholders.

## School creation and edit

1. Open **Create Institution**. Confirm a generated `INS-...` ID appears and can be regenerated before creation.
2. Select **School**. Enter a school name and optional institution code; choose an initial Chairman/Principal name, email, password, and display role. Keep the ID, type, name, and credentials unique to the test.
3. Set an academic session, leave the default class selection or change it, enter sections such as `A, B`, add subjects such as `English, Mathematics, Science`, set admission/brand fields, and optionally upload a logo.
4. Click **CREATE INSTITUTION & CHAIRMAN** once. Expect a success toast containing the ID. Open **Institutions** and confirm the School row, type, Chairman/Principal, and admission state appear. Search by ID/name and filter to Schools.
5. Verify the database uses the exact same tenant key everywhere:

   ```sql
   select id, "schoolName", institution_type, institution_code,
          academic_config, "themeColor", "secondaryColor", "admissionOpen", "examSubjects"
     from public.schools
    where id = 'SCHOOL_ID';

   select id, "schoolId", role, "staffRole", name, email, status
     from public.users
    where "schoolId" = 'SCHOOL_ID';

   select id, "schoolId", name, "isCurrent"
     from public.academic_sessions
    where "schoolId" = 'SCHOOL_ID';

   select id, "schoolId", name, code, kind, "programId"
     from public.academic_levels
    where "schoolId" = 'SCHOOL_ID'
    order by "sortOrder";

   select "schoolId", class, name, "levelId", "academicSessionId"
     from public.sections
    where "schoolId" = 'SCHOOL_ID';
   ```

   Expected: `schools.id`, Chairman `users.schoolId`, academic session/level `schoolId`, and section `schoolId` all equal `SCHOOL_ID`. School `examSubjects` stays compatible with the Chairman portal's existing exam-subject setting where that column is available.
6. Sign in to the Chairman portal using the created account and confirm it resolves to the same institution. In the Company registry, click **CONFIGURE**. Confirm ID and type are disabled/stable. Change a safe profile value (for example, name, admission state, or a subject), save, and confirm the same row/ID is updated. Existing academic rows are retained; this workflow does not delete omitted classes, departments, programs, levels, or sections.
7. Click **DEACTIVATE**, confirm, and verify the linked Chairman row's status becomes `blocked`; click **ACTIVATE** and verify it returns to `active`. Confirm these actions do not create another institution or alter students.

## College creation and edit

1. Open **Create Institution**, generate a fresh ID, select **College**, and enter a different institution name and unique Chairman/Principal account.
2. Set a session. Add at least one department (for example, `Computer Applications` / `CA`) and at least one program/course (for example, `Bachelor of Computer Applications` / `BCA`). Choose a level system (for example, Semester), a count (for example, 6), and section names (for example, `A, B`). Add a second department/program too if verifying multiple records.
3. Save once. In **Institutions**, confirm the College row and search/type filter. Verify the shared tenant key and reference hierarchy:

   ```sql
   select id, "schoolName", institution_type, institution_code, academic_config
     from public.schools
    where id = 'COLLEGE_ID';

   select id, "schoolId", name, code, status
     from public.departments
    where "schoolId" = 'COLLEGE_ID';

   select id, "schoolId", "departmentId", name, code, "levelType", duration, status
     from public.programs
    where "schoolId" = 'COLLEGE_ID';

   select id, "schoolId", "departmentId", "programId", name, code, kind, "sortOrder"
     from public.academic_levels
    where "schoolId" = 'COLLEGE_ID'
    order by "sortOrder";

   select id, "schoolId", "levelId", "programId", class, name, "academicSessionId"
     from public.sections
    where "schoolId" = 'COLLEGE_ID';
   ```

   Expected: every row's `schoolId` is exactly `COLLEGE_ID`; each program's `departmentId` points to a department in that college; each generated semester/year/trimester/custom level and section points to the same college and the appropriate program/level. Level codes match the Chairman portal's three-letter prefixes (`SEM`, `YEA`, `TRI`, `LEV`); the example uses `BCA-SEM1` through `BCA-SEM6`.
4. Re-open **CONFIGURE**. Confirm College structure is reconstructed from the reference `departments`, `programs`, `academic_levels`, `sections`, and `academic_sessions` tables, not only from a Company-side list. Add a new program or increase a level count, save, and verify new rows appear while pre-existing rows remain. Department/program status is preserved during edits.
5. Verify the type is stable: the edit form disables it, and a direct attempt to change type through `company_configure_institution` after academic/student rows exist is rejected.
6. Create a second College with new ID, department, program, and Chairman. Confirm it appears independently in the registry and its rows never use the first College's `schoolId`.

## Registration intake and tenant-isolation checks

1. In public registration, submit one School request and one College request. Confirm each `pending_registrations.institution_type` is saved correctly, and that approved registration lookup preserves it through `accepted_registrations.institution_type`.
2. If **AUTO DEPLOY** is used for a College request, the public request form captures its type but not a department/program design. Complete its academic setup with **CONFIGURE** before treating it as ready for normal College operations.
3. With Chairman A signed in, query/read the Phase A tenant-scoped tables for College/School B. RLS should return no rows for B (or deny a write); repeat with a non-Company account. Do not add policies to make these cross-tenant checks pass. The Company registry/provisioning operations should work only through the new Company RPCs and the existing tenant deployment RPCs.

## Expected browser/build checks

The Company portal is a static HTML/JavaScript site without a package manifest or repository test/lint script. At minimum run `node --check script.js`, `git diff --check`, and the HTML-hook/ID checks described in the change report. Real database/RLS acceptance still requires the owner's manual Supabase migration and test project.
