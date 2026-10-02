# Company institution provisioning — implementation and migration review

**Prepared:** 2026-10-02  
**Repository:** Company-Website only  
**Review status:** local source/migration review complete; live Supabase schema, RPC definitions, grants, `provider_id`, and runtime provisioning have **not** been verified.  
**Execution status:** no Supabase SQL or migration was executed.

## 1. Scope implemented

The Company Portal now provisions the institution shell and institution-level settings only. Its existing identity contract is preserved: `public.schools` remains the institution record, `schools.id` is the dynamic Institution ID, and the same ID is sent as the initial Chairman/Principal's `users.schoolId` and is expected on tenant-scoped records.

The Company form collects these institution-level values at creation:

- Institution ID, institution name, School/College type, and institution code
- Address and location (country, state, district, and postal code)
- Phone, alternate phone, email, and website
- Registration/affiliation number and School board/segment information
- Logo, colors, branding, admission/basic institution settings
- Initial subscription tier and Chairman/Principal name, email, password, and role label

The chosen subscription tier is passed to the existing `deploy_tenant_node` RPC at creation. This change does not add a subscription-tier edit operation: the target live storage/ownership for that value must be confirmed before extending edits. Existing license-management actions remain separate.

The Company form no longer asks for or saves academic sessions, school classes/subjects/sections, College departments/programs/levels/sections, HODs, or staff. The form explains that the institution's own Chairman/Principal portal owns this setup. Editing institution metadata does not send an academic configuration payload. The Chairman Portal/reference repository was not modified.

### Code paths changed

- `index.html`: removed the school class/session/subject controls and College department/program builder. Replaced them with an institution-side ownership note.
- `script.js`: removed academic draft/editor hydration and academic configuration payload construction. Institution create/edit continues to use the existing tenant provisioning calls and the institution-only configuration RPC.
- `supabase/migrations/20261002153000_company_institution_provisioning.sql`: removed Company-side academic read/write/provision logic. Keeps registration type, role-checked institution registry/configuration/access RPCs, and shared `schools.id` / `users.schoolId` assumptions. It does not create an institution row itself; the existing tenant deployment RPC remains responsible for deployment.
- `docs/INSTITUTION-PROVISIONING-TESTS.md`: rewritten for the institution-only scope and as a pre-migration test checklist.

## 2. Architecture reference and migration impact

The designated Chairman Phase A reference migration describes the existing `public.schools` table as the institution table, `public.users` as staff/auth records, and `public.students` as existing student records. It defines the tenant convention as `schools.id` and the project's text `schoolId` column. The Phase A schema creates the reference academic tables (`departments`, `programs`, `academic_sessions`, `academic_levels`, `sections`, plus assignment tables) and adds `institution_type`, `institution_code`, `logoUrl`, `branding`, and `academic_config` to `schools`.

That reference is not the live Supabase database. The Company migration is written against it and must be checked against the actual target schema before execution.

The Company migration:

1. Adds `institution_type` to `pending_registrations` and `accepted_registrations`, defaults old/missing/invalid values to `school`, and constrains values to `school` or `college`.
2. Creates `company_institution_setup_ready`, `company_institution_id_available`, `company_list_institutions`, `company_set_chairman_access`, and `company_configure_institution` RPCs.
3. Keeps institution setup/configuration scoped to an existing `schools.id`; the browser continues to call existing `create_chairman_auth_user` and `deploy_tenant_node` provisioning RPCs.
4. Writes only institution-level `schools`/Chairman profile fields. Its type-change guard performs reads against the reference student/academic tables; it does not create, update, or delete those rows.
5. Does not add or alter RLS policies, does not add a tenant table, and does not create a Company-side academic configuration column or academic rows.
6. Uses a SQL `BEGIN`/`COMMIT` block for the migration itself. This only describes migration DDL/DML transaction scope; it does not make the separate browser provisioning requests atomic.

The migration expects the reference Phase A schema to be installed first and the updated institution/staff RLS plan to be reviewed separately. The Company migration does not replace or silently apply those reference files.

## 3. `provider_id` audit — unresolved for live deployment

**Known from the Company repository:** no Company JavaScript provisioning payload or Company migration DDL/update sets or reads `provider_id`. The Company flow sends the dynamic institution ID as `p_school_id` to the existing provisioning RPCs and relies on `schools.id` / `users.schoolId` for tenant identity.

**Known from the designated Phase A reference artifact:** its documented tenant key is `schools.id` / `schoolId`; that file does not establish the live meaning, nullability, foreign key, trigger behavior, or provisioning rules of any `provider_id` column. This is not evidence that the live schema has no such column or does not require it.

**Not verified:** whether `provider_id` exists in the live `public.users`, `public.schools`, `auth.users`, another table, or an RPC payload; whether `deploy_tenant_node` assigns it; and whether a specific Company/provider identity must be associated with a new tenant or Chairman. The implementation report does not infer a value or add a duplicate relationship.

**Owner action before migration:** inspect all relevant live columns/constraints/triggers and the definitions of `create_chairman_auth_user` and `deploy_tenant_node`. The read-only inspection queries in `docs/INSTITUTION-PROVISIONING-TESTS.md` are starting points. Confirm the value/relationship is either handled by the existing RPC or not required. Resolve any discrepancy before using Company provisioning in production.

## 4. Provisioning atomicity — end-to-end flow is not established as atomic

The Company browser currently orchestrates institution creation as separate requests:

1. Check Company authorization and proposed ID availability.
2. Optionally upload a logo to the external image service.
3. Call `create_chairman_auth_user`.
4. Call `deploy_tenant_node` with the same `p_school_id`.
5. Call `company_configure_institution` to persist institution-level settings.
6. For approved-registration auto-deploy, delete the pending request in a later request.

The `create_chairman_auth_user` and `deploy_tenant_node` function bodies are not in this repository, so their internal transaction behavior, Auth side effects, cleanup, and retry/idempotency guarantees have not been reviewed. Even if an individual database RPC is transactional, the complete multi-request browser workflow is not one database transaction. Failures can therefore leave an Auth user without a deployed school, a deployed institution needing metadata retry, or a completed deployment whose pending registration was not deleted. The normal create flow retains the generated ID and offers a metadata retry after deployment success; this is a recovery aid, not proof of atomicity or rollback.

**Conclusion:** do not represent end-to-end provisioning as atomic. Verify the two existing function definitions in the live project and exercise each failure boundary in staging. The owner must approve an explicit recovery/reconciliation policy (or a future server-side idempotent orchestration design) before production use. The migration itself being wrapped in `BEGIN`/`COMMIT` does not change this conclusion.

## 5. Company RPC permission review — code design known, live enforcement unverified

The new Company RPCs are declared `SECURITY DEFINER` with `search_path = public`. The migration revokes execute privileges from both `PUBLIC` and `anon`, then grants `EXECUTE` to `authenticated`. The sensitive operations call `company_institution_setup_ready()`, which checks `auth.uid()` against `public.users.id` and accepts the Company roles `developer`, `admin`, `superadmin`, and `root`. This is an in-function role check; `authenticated` alone is not intended to authorize a non-Company caller. The registry returns institution-level fields and a minimal Chairman summary, not passwords or academic/student/staff rows. No broad cross-tenant RLS policy is added by this Company migration.

These are properties of the proposed SQL, not proof of effective live permissions. Before execution, the owner must verify that:

- The live `users.id` type/value really matches `auth.uid()::text`, and the Company role values are authoritative.
- The function owner has the required rights and is not constrained by `FORCE ROW LEVEL SECURITY`; `SECURITY DEFINER` ownership and actual grants must be inspected.
- `PUBLIC`/`anon` cannot execute the privileged RPCs after the migration, and ordinary authenticated users cannot pass the role check or acquire a Company role through another write path.
- The live `users` RLS policies/table grants and the existing provisioning RPC grants do not undermine these checks.

**Important existing Company login path to review:** `script.js` currently treats a missing `public.users` profile as allowed in `bootstrapDashboard()` and attempts to upsert that authenticated user's row with `role: "developer"`. Whether that upsert succeeds depends on live grants/RLS, which have not been inspected here. If an ordinary authenticated user can create/update their own row that way, the new RPC role check is bypassable. The Company migration does not repair this pre-existing bootstrap path. The owner must verify that this path is protected or explicitly approve a Company-only hardening change before relying on the role gate; do not assume the SQL grants alone settle the permission audit.

`company_institution_setup_ready()` itself is callable by authenticated users and returns only a boolean. The other RPCs perform their own Company-role check. The migration's intended execute grants should still be verified in the actual project after manual application.

## 6. Live-schema assumptions to compare before execution

The migration expects, at minimum:

- Existing `public.pending_registrations` and `public.accepted_registrations` tables.
- Phase A columns on `public.schools`: `id`, `schoolName`, `institution_type`, `institution_code`, `logoUrl`, and `branding`; plus the existing Company fields `themeColor` and `admissionOpen`.
- `public.users` with `id`, `schoolId`, `role`, `name`, `email`, and the existing profile/status columns used by the Company Portal. `blockReason` and some profile values are handled conditionally; core key fields are not optional.
- Reference tables `students`, `departments`, `programs`, `academic_sessions`, `academic_levels`, and `sections`, all tenant-keyed by `schoolId`, for the type-change guard.
- Existing `create_chairman_auth_user` and `deploy_tenant_node` signatures and behavior expected by current Company JavaScript.
- Authority to install the migration and own/execute the `SECURITY DEFINER` functions.

Potential incompatibilities such as changed column case/type, missing tables, duplicate constraint names, function signature conflicts, forced RLS, or an existing Company function overload must be resolved by the owner against the live schema. No compatibility claim is made until that comparison is complete.

## 7. Recommended owner review sequence

1. Take the project's normal backup/schema snapshot and confirm the target environment.
2. Compare this SQL with the live information schema and inspect `provider_id`, existing RPC bodies, owners, grants, triggers, RLS, and Company login bootstrap permissions. Use the report checklist and read-only queries in `docs/INSTITUTION-PROVISIONING-TESTS.md`.
3. Resolve the `provider_id` mapping question, end-to-end failure/retry policy, and Company self-provisioning permission risk. Do not infer these answers from the reference repository.
4. Review/apply the reference Phase A and staff-portal RLS SQL in the owner-approved order, then manually review this Company migration in a disposable test project. This repository has not executed any of those files.
5. Test School and College institution-shell creation, exact ID propagation, metadata edits, Company/non-Company RPC access, no Company-generated academic rows, and forced-failure/retry behavior. Check tenant RLS through each institution's own account.
6. Only after the owner accepts the test results and migration effects should the owner schedule any production rollout.

## 8. Local validation and limits

Local checks completed: `node --check script.js` passed; `git diff --check` passed; HTML parsing found 325 IDs with no duplicates; removed academic UI/payload hooks were absent; the SQL parser accepted 35 top-level statements; and a local static HTTP preview smoke test passed. These checks cannot prove Supabase schema compatibility, permissions, provider mapping, or runtime atomicity. No live database validation is claimed.

**Supabase SQL was NOT executed by me. The required SQL/migrations were prepared in the Company Portal repository for manual execution.**
