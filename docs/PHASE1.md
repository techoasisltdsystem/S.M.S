# Phase 1: foundation and security

Status as of 2026-10-19. Plan and gap analysis:
https://claude.ai/code/artifact/11a78048-920e-4ccd-902f-2c829f278cc2

## What works

- **Schools (tenants).** `schools`, `campuses`, `school_memberships`,
  `role_permissions`, `school_invitations`, `platform_admins`
  (`supabase/migrations/20261019180000_tenancy_roles_rls.sql`). Every
  school-owned row carries `school_id`; a profile is one person in one school.
- **Roles and permissions.** School admin, teacher, student, parent, finance
  officer, auditor, with the explicit permissions from PDF section 12.2
  (`users.manage`, `audit.view`, `school.settings.manage`, ...).
- **Row-Level Security on every table**, decided from `auth.uid()` and the
  caller's active membership. Nothing the browser sends about school, role or
  permission is trusted. No table can be deleted from through the API.
- **Real sign-in.** Hosted Supabase uses Supabase Auth; the laptop database
  checks bcrypt passwords and issues signed, revocable session tokens.
  Five failed attempts in 15 minutes lock sign-in for that email (laptop;
  Supabase applies its own rate limits).
- **Invitations.** Admins add people with `invite_member()`; the person gets a
  single-use link valid 7 days (only a SHA-256 digest is stored) and chooses a
  password at `/accept-invite`.
- **Second factor for admin powers (hosted Supabase).** The database refuses
  `users.manage`, `staff.manage`, `school.settings.manage` and
  `payments.refund` to a password-only (`aal1`) session; the app walks admins
  through authenticator-app setup.
- **Append-only audit log.** Written only by database triggers and functions
  (role changes, status changes, settings changes, invitations, sign-in and
  sign-out); readable with `audit.view`; never editable or deletable.
- **Page guards.** Menus and routes follow permissions; a blocked page says so.
- **Honest screens.** Students, fees and every unbuilt module say which phase
  brings them; the settings page says which options are not saved yet; the
  fake notification count is gone.

## Not finished

- Hosted Supabase is not set up yet (your free plan is at its 2-project
  limit), so the Vercel site cannot sign anyone in. It says so on the sign-in
  screen. Password reset by email and MFA work only with hosted Supabase.
- Laptop sign-in has no MFA and no email (password reset, invitation emails).
  Admins copy the invitation link and send it themselves.
- Session tokens are kept in browser storage, not HttpOnly cookies. Cookies
  need a server in front of the database (later phase).
- Platform super admin console, licences and subscriptions: Phase 2. A
  platform admin can only be added by an operator in the database.
- The school-assets bucket stays publicly readable (logos); only that school's
  admins can write to its folder. Private buckets come with student documents.
- Laptop backups are not set up.
- Not reviewed for Ghana's Data Protection Act (Act 843) or anything else; see
  the legal-review list in the plan.

## How to verify

On the laptop (Windows), from the project folder:

```
npm run db:stop
npm run db:setup
npm run db:create-school
npm run db:test
npm run dev:local
```

`db:test` prints a PASS line for each check (45 in total) and stops on the
first failure. Then in the browser:

1. Open http://localhost:8080/admin and sign in with a wrong password: refused.
2. Sign in with the right one: your school's dashboard.
3. User Management → Add person → a teacher. Copy the link.
4. Open the link in a private window, choose a password: signed in as teacher.
5. As the teacher, open http://localhost:8080/user-management: blocked.
6. Back as admin, Audit Logs shows the sign-in, invitation and acceptance.

## Hosted Supabase (when a project is available)

1. Create the project, then apply `supabase/migrations` (`supabase db push`).
2. Authentication → Providers: email on; Authentication → MFA: TOTP on.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` on Vercel.
4. Create the first school in the SQL editor:
   `select public.bootstrap_school('School name', 'school-slug', 'Admin name', 'admin@email');`
   It returns a token; open `https://<site>/accept-invite?token=<token>`.
