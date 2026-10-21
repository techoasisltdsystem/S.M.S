# Phase 4: subscriptions, Paystack billing, client monitoring and Super Admin access

What was built, how it is secured, how to switch it on, and what is **not** done yet.

## What works today, and what does not

| Area | Status |
| --- | --- |
| Public pricing page, comparison, FAQ, checkout (package, details, review, pay), success / failed / cancelled / pending pages | Built and tested in the browser against the **demo** checkout |
| Server-side pricing, order creation, verification, idempotent settlement, webhook signature check | Built and covered by tests with a **fake Paystack** |
| Real Paystack payments | **Not verified.** Needs your Paystack keys, a public webhook URL and a live end-to-end test (see "Going live") |
| Email (reset links, renewal reminders) | Reset email works through Resend once configured. Reminder **emails are queued only**; in-app reminders work |
| Automatic recurring charges | **Not implemented.** Renewals are manual with reminders, as the pricing page says |
| Refund processing | Order status `refunded` exists and is excluded from revenue. There is no refund screen; refunds are made in the Paystack dashboard |
| Multi-factor sign-in for Super Admin | Not added (depends on the auth provider; Supabase only) |
| Scheduled expiry and reminder job | Built (`audit_monitor_tick`); it must be scheduled (see below) |

## Database (migrations `20261028*`)

| Migration | Adds |
| --- | --- |
| `billing_enum` | Audit actions `payment_verified`, `payment_failed`, `subscription_renewed`, `billing_adjusted`, `password_reset_requested` |
| `billing` | Package fields (yearly price, trial days, storage, public / recommended flags, bullet points); `billing_settings`, `billing_changes`, `billing_orders`, `payment_events`, `subscription_periods`, `reminder_log`; the lifecycle rules; the browser-facing order functions; the server-only settlement functions |
| `billing_platform` | Super Admin reads and actions (clients, client detail, transactions, reconciliation, overview and chart data, package and settings editors, extensions), the School Admin's `my_billing`, and the reminder / expiry tick |
| `billing_guard_fix`, `billing_suspended_access`, `recovery_issue_once`, `portable_random` | Fixes found while testing: gateway chosen at checkout start; a suspended school's admin can still view billing and pay; one reset token per request; no dependency on `pgcrypto` |
| `password_recovery` | `password_reset_requests` and the recovery functions. The local-database token consumption (`local_reset_password`) is in `scripts/local-db/local-auth.sql` |

All billing tables have row-level security on and **no** grants to the API roles. Everything goes through narrow functions.

## Subscription lifecycle

Stored status: `trial`, `active`, `past_due`, `expired`, `cancelled`. The Super Admin also sees `renewal_due` (active and ending within 14 days) and `suspended` (school access restricted), derived by `subscription_label()`. A school with an unpaid checkout is shown under "Awaiting payment" on the payments overview, because a school is only created after its first payment is verified (so there is no "pending payment" school).

Allowed changes (`subscription_transition_ok`): trial to active, past_due, expired, cancelled; active to past_due, expired, cancelled; past_due to active, expired, cancelled; expired to active, cancelled; cancelled to active. Anything else is refused, including from the manual "change status" action.

Server-side timeline (the job calls `billing_reminder_tick()` then `subscriptions_enforce()`):

1. Period ends with no verified renewal: `past_due`, school keeps full access during the **grace period** (default 7 days, editable).
2. Grace ends: `expired`; the school becomes **read-only** (suspended by subscription). Nothing is deleted.
3. A verified renewal sets `active`, extends from the old end date (or today if it had lapsed) and restores access.

Dates are stored as timestamps / dates in the database and compared against the database clock. The browser only displays them.

## Payment flow

1. Browser calls `billing_start_signup` (new school) or `billing_start_order` (School Admin renewing or changing package). The **database** prices the order from the stored plan, adds the configured tax, creates the reference, and returns a claim code held only by that browser.
2. Browser asks `/api/billing/initialize` for a checkout address with just the reference and claim code. The server reads the amount from the order, calls Paystack `transaction/initialize` with the secret key, and returns Paystack's hosted page.
3. Paystack sends the buyer back to `/checkout/return` and, separately, posts a webhook.
4. The return page calls `/api/billing/verify`. The server asks **Paystack** for the transaction and calls `billing_settle`. The redirect and the URL prove nothing.
5. `billing_settle` (server-only) checks status `success`, the **amount and currency against the order**, then in one transaction creates the school (new purchases) or updates the subscription, writes the period, the history entry and the audit entry. Settling again changes nothing.
6. A new school's administrator gets a **one-time** sign-up link on the confirmation page (shown once, to the holder of the claim code) and sets their own password.

Webhook (`/api/billing/webhook`): the HMAC-SHA512 signature is checked on the raw body with the secret key; a bad signature is rejected (HTTP 401) and recorded. A valid `charge.success` is not trusted either: the server confirms with Paystack, then settles. Duplicates are recognised (`payment_events` unique key) and a failed first attempt is not marked as handled, so Paystack's retry still works.

Payment methods are whatever Paystack's hosted page offers for your merchant account, country and currency. The site does not list any method itself and never handles card details.

### Demo checkout

`BILLING_DEMO=on` enables a clearly labelled demo page that stands in for Paystack. It is ignored when `VERCEL_ENV` or `NODE_ENV` is `production`, every order it settles is stored as `gateway = demo`, shown with a **DEMO** tag, excluded from revenue, and its receipt says it is not a real transaction. A demo order cannot be settled through the Paystack path.

### Who can do what

- Super Admin: sees every client, admin, package, dates, payments, reminders, reconciliation, and can extend or change a subscription with a reason. These are **adjustments** with before / after values; they never create a payment and never count as revenue. There is no function that marks an order paid except `billing_settle`, which has no grant to any signed-in role.
- School Admin: sees and pays only their own school's billing (also when the school is read-only). Receipts are only produced for verified payments.
- Everyone else: nothing.

## Super Admin access

- Separate sign-in at `/super-admin/login` (linked discreetly as "Platform administration" on the login pages and the site footer). The link is a convenience; the database decides who is a platform administrator.
- `platformLogin` accepts only accounts listed as platform administrators with no school membership. A school login gets the same "could not sign you in" message as a wrong password. School login pages now refuse platform accounts with a pointer to the Super Admin login.
- Wrong-password lockout (5 failures in 15 minutes) and sign-in attempt records are the existing local-auth ones. Platform administrators are created only with `npm run db:create-platform-admin` (no public sign-up, no password in source).
- New navigation: Platform overview, Clients and schools, Subscriptions, Renewals and expiry, Pricing and packages, Payments, Audit and security, Administrative activity, Support, Platform settings.

### Password reset for a School Admin

Client page, "Profile and admin", "Send password reset": confirm school, name and email; the server emails a single-use link valid for one hour to the admin's own address. The Super Admin never sees a password or the link. Up to 3 requests per hour per account. Each request is audited (no token in the log) and its **real** outcome (sent, failed, used, expired) is shown; a failed send is shown as failed.

- Local database: the billing backend sends the email (Resend, or the dev console log with `MAIL_DEV_LOG=on`, development only). The token is stored as a digest; using it signs out every open session of that login.
- Hosted Supabase / Neon: the provider's own recovery email is triggered and the outcome recorded. **Untested** here.

## Environment variables

Set these in `.env.local` (laptop) or the host's environment (never in the browser or git):

| Variable | Purpose |
| --- | --- |
| `PAYSTACK_SECRET_KEY` | `sk_test_...` or `sk_live_...`. Without it real payments are unavailable |
| `APP_URL` | Public address of the site, used for the Paystack return link (e.g. `https://your-site.example`) |
| `BILLING_DEMO` | `on` to allow the demo checkout (ignored in production) |
| `RESEND_API_KEY`, `MAIL_FROM` | Reset email delivery |
| `MAIL_DEV_LOG` | `on` prints reset links to the server console (development only) |
| `DATABASE_URL` (or the Neon variables) | Connection the billing backend uses to settle orders |

## Going live (not done yet)

1. Create the Paystack account, finish business verification, and enable the payment channels you want (cards, mobile money, ...) in the dashboard.
2. Put `PAYSTACK_SECRET_KEY` (test key first) and `APP_URL` in the host's environment. The backend runs as the functions in `api/billing/*` on Vercel, or inside the Vite dev server on a laptop.
3. In Paystack Dashboard, Settings, API Keys and Webhooks, set the webhook URL to `https://<your-site>/api/billing/webhook`. Paystack signs it with the same secret key. For local testing use a tunnel.
4. Run an end-to-end test with Paystack **test** cards and test mobile money: successful, declined, abandoned, and a repeated webhook. Confirm the school is created once and the amount matches.
5. Schedule the expiry and reminder job. It is the existing monitor: run `npm run audit:monitor` from a scheduler every 5 to 15 minutes (or `npm run audit:monitor:watch` as a service). Nothing marks a subscription past due or sends reminders unless it runs. Run `npm run audit:verify` from a different scheduler to notice if it stops.
6. Connect email (Resend or another provider) if you want reset emails; reminder emails need a small sender added to the queue in `reminder_log` (currently queued only).
7. Set the Terms and Privacy links, support email and phone, tax rate, grace period and reminder days under Platform settings.
8. Replace the placeholder package text and prices under Pricing and packages if they are not final (they are real database rows now, not page text).

## Tests

- `npm run db:test`: `billing_access.sql` (106 checks: server pricing, settlement, idempotency, mismatches, failed / abandoned payments, demo rules, renewals continuing from the end date, price changes not rewriting history, tax, adjustments without payments, lifecycle rules, reminders without duplicates, expiry and restore, access for every role), `local-auth.test.sql` (recovery: single use, expiry, no token in audit, rate limits).
- `npm run billing:test`: the backend with a fake Paystack inside a rolled-back transaction (amount taken from the database, bad and valid signatures, webhook not trusted without Paystack's confirmation, duplicates, mismatch, failed payment retry, demo rules, reset email failure reported as failed).
- Browser-checked: pricing (narrow viewport), full demo purchase, one-time sign-up link, billing history and receipt, School Admin refused at the Super Admin login, client list and detail, password reset end to end, expired school restored by a verified renewal.
- Pricing and checkout were checked for horizontal overflow at phone, tablet and desktop widths (one tablet overflow found and fixed).
- Not tested: real Paystack, real email, hosted-provider reset, and the Super Admin pages at tablet and desktop widths.

## Platform console additions

- **Super Admin team** (`/platform/admins`): any active Super Admin can add another. The server route `POST /api/billing/platform-admin` checks the caller through the database (`is_platform_admin`), creates the login (local: `auth_local.create_platform_admin`; hosted: Neon Auth sign-up), generates a 16-character temporary password shown once, and records the new admin through `platform_admin_register`. Admins can be switched off and restored (`platform_admin_set_disabled`); nobody can switch themselves off and the last active admin cannot be switched off. `is_platform_admin()` ignores switched-off admins.
- **My account** (`/platform/profile`): name, sign-in email (password re-checked first, `platform_admin_change_my_email`) and password change.
- **System health** (`/platform/health`): `platform_health()` counts plus the scheduled-check status.
- **Platform overview** gained subscription, revenue and "needs attention" panels from `platform_billing_overview`.
- Migration `20261030090000_platform_team.sql`. A new hosted admin has no forced password change (Neon Auth); the dialog tells the giver to ask them to change it on first sign-in.

## Platform roles and invitations (migration `20261030120000_platform_roles.sql`)

- **Roles**: Super Admin (everything), Platform Admin, Billing Admin, Support Admin. Each admin row holds a role and an explicit permission list (`module.view` / `module.manage`: clients, billing, support, audit; plus `settings.manage`, `health.view`, `admins.manage`). Role presets are in `platform_role_preset()` and mirrored in `src/lib/platformRoles.ts`. Existing admins became Super Admins.
- **Enforcement**: every platform database function checks its own permission (`platform_can` / `platform_require`); the migration rewrites the old "any platform admin" guard in each function. Routes and sidebar items follow the same permissions, but the database is what refuses direct calls.
- **Anti-escalation**: nobody changes their own role, only a Super Admin makes or changes a Super Admin, others can grant only permissions they hold, and the last active Super Admin cannot be demoted or switched off.
- **Invitations**: `/platform/admins` -> Invite. The server stores only the SHA-256 of a one-time 7-day link; the invitee sets their own password at `/platform-invite` (12+ characters). No password is generated, shown or emailed. If email is not configured the inviter is shown the one-time link instead. Resend rotates the link; revoke kills it.
- **Password reset for another admin**: sends the provider's reset email; the Super Admin never sees a password.
- Tests: `supabase/tests/platform_roles.sql` (21 checks).
- Not built yet: per-action create/edit/suspend/approve/export permissions (only view/manage), invite-accept audit entries, login/session history, forced email verification on email change.

## Platform operations (migration `20261030140000_platform_ops.sql`)

- **Event log** (`platform_events`, `/platform/events`): append-only (a trigger refuses edits and deletes). Records sign-ins, invitations, role/access changes, switch-off/restore, sign-in email changes, announcements, report views, transaction exports and support assignments, with actor, time, subject and detail. Never stores passwords or tokens. Viewed with `audit.view`; every administrator can read their own history on their account page.
- **Finer permissions**: `clients.create`, `clients.suspend`, `billing.export`, `announcements.manage` added. Presets updated; `/platform/roles` shows the matrix.
- **Announcements** (`/platform/announcements`): draft, publish, unpublish, archive; type (notice / maintenance / product update); audience (everyone, school administrators, teachers, students, parents); optional start and end time; reach count. Published ones appear as a banner for the audience (`my_platform_announcements`).
- **Analytics and reports** (`/platform/reports`): any date range up to three years; revenue by month and package, registrations, paid/pending/failed counts; CSV download. Demo payments excluded.
- **Invoices and receipts** (`/platform/invoices`): paid orders with receipt PDF from the stored order (`platform_receipt`). Transaction export needs `billing.export` and is logged.
- **School onboarding / administrators / usage**: read-only views from real records (counts only, no pupil data). Schools activate when payment is verified, so there is no separate approval queue.
- **Support**: requests can be assigned to a platform administrator (`support_assign`).
- **Recovery and backups**: the database is Neon Postgres; backups and point-in-time restore are provided and controlled in the Neon console, not from this app. To recover: restore the branch in Neon to the wanted time, point `DATABASE_URL` at it, redeploy. No destructive data controls were added to the console.
- Not applicable / not built: discounts and promotions (no such billing model), help documentation, forced email verification on sign-in email change (Neon Auth flow not confirmed), session revocation of other devices (password change already signs others out on the local login).

## School fee audit and online payments (migration `20261030160000_fee_online_payments.sql`)

**Audit of what existed (Phase 3G):** `fee_structures`, `invoices` + `invoice_lines` (NUMERIC(12,2) money), `payments` (recorded/voided, sequential receipt numbers), `fee_counters`, permission-gated `record_payment` / `void_payment` / `cancel_invoice` / `generate_invoices` (no duplicates per structure+student), `send_fee_reminders`, parent and staff fee pages, PDF invoice/receipt, in-app `notifications`, guardian-only visibility (`is_guardian_of`), fee audit events. Academic years and terms exist as tables (one current each) with no management UI; `events` backs a simple calendar.

**Added now:** parents pay an invoice (full or part) through Paystack.
- `fee_payment_orders` (+ `fee_payment_events`): one row per attempt, amount/currency/invoice/payer fixed in the database; references `FEE-...`, separate from platform `billing_orders`.
- `fee_pay_start` (caller must be a verified guardian; amount must be 0 < x <= balance from the ledger; invoice locked), server routes `/api/billing/fee-initialize` and `/fee-verify`, and the shared `/api/billing/webhook` (FEE references are routed to fee settlement).
- `fee_settle` is server-only and idempotent: Paystack's own answer is fetched by the server; amount and currency must equal the order; only `success` writes a `payments` row (method `paystack`, linked by `order_id`, UNIQUE). Failed/abandoned/mismatched never touch the ledger. Two competing payments cannot over-collect: the second is recorded as `excess` and finance is notified (refund/credit decision is manual).
- Receipt number comes from the existing counter; guardians, the student and finance staff get in-app notifications from the settled record; a notification failure cannot undo a payment.
- UI: Pay online panel in the parent invoice dialog, `/fees/return` confirmation page, and an "Online payments" tab for finance (attempts, review list, excess).
- Verified: 30+ new database checks, 4 server tests with a fake Paystack, and in Paystack TEST mode a real initialize and a real verify of an abandoned checkout (no ledger change). A completed card payment in Paystack test mode was NOT performed. No live charge has been made.
- Rollback: `DROP TABLE fee_payment_orders CASCADE` after removing `payments.order_id`, restore the old `payments_method_check`; no existing rows are changed.

**Not built yet (gaps against the full spec):** academic year/term management screens and lifecycle states, per-term fee due dates and reminder schedules, fee structures by programme/student group/scholarship, discounts and waivers ledger, refunds (only void), student self-payment, email delivery of confirmations and reminders (in-app only), notification centre filters/retry state, role calendars with visibility/publish/cancel, reconciliation against Paystack's transaction list, collection reports by term/class/category, scheduled reminders for fees. 

## Fees completed, academic periods and calendar (migrations `20261031100000` to `20261031170000`)

**Academic periods** (Fees > Periods): years and any number of terms/semesters per school, with status (draft, published, completed, archived; periods also closed), fee due date, reminder days, exam and break dates; no overlaps, dates must sit inside the year; publish the calendar (tells the school); close a period (nothing is deleted, no further edits). The existing Classes setup page still creates years and terms; the new fields change only through `save_term`, `set_term_fee_due`, `close_term` etc. (direct column writes are revoked).
**Fee due date = one source of truth:** `terms.fee_due_on`. Fees linked to a period (`fee_structures.term_id`) raise invoices with that date. `set_term_fee_due` needs a reason, moves unpaid invoices of that period, notifies families, and writes the audit record. Paid invoices are untouched.
**Adjustments:** discount, scholarship, waiver or charge (`apply_fee_adjustment`, permission `fees.adjust`): immutable `fee_adjustments` rows plus a visible invoice line; cannot take the invoice below what is already paid; family notified; audited.
**Offline payment approval** (setting): payments wait as `pending`, are not counted as paid and not announced; approver needs `payments.approve` and cannot be the recorder. Duplicate references are refused.
**Students** see their own invoices and statements; paying is off unless the school switches it on. **Teachers** see only a one-word status for their own class and only if granted `fees.status`.
**Refunds:** `fee_refund_begin` (needs `payments.refund`) reverses the payment in the ledger (kept as voided "Refunded: ..."), and an online refund is sent to Paystack by `/api/billing/fee-refund`; failures are recorded and retryable; excess money can be refunded too.
**Reconciliation:** "Check pending payments with Paystack" and the scheduled job re-verify stuck attempts with Paystack; only what Paystack confirms is applied.
**Reminders and email:** `fee_reminder_tick` (before-due days per period, overdue days per school) sends each (invoice, stage, due date, person) once and names the remaining balance; `calendar_reminder_tick` does the same for events. Both write in-app notifications and queue emails in `notification_outbox`, sent by `/api/billing/cron` (retries up to 5, tracked separately from the payment/event).
**Reports:** `fee_report` (settled ledger only): assessed, discounts, charges, online/offline, gross, refunds, reversals, net, outstanding, overdue, status counts, by class/period/category/method, daily/monthly. CSV export needs `fees.export` and is audited. Statements: PDF per student.
**Calendar:** events have draft/published/cancelled, description, all-day, class targeting, reminders, history and audit; publishing, moving and cancelling notify exactly the audience; cancelling needs a reason; staff-only and draft events are hidden from students and parents by row-level security; overlaps are shown as a warning.
**Scheduled job setup:** set `CRON_SECRET` on Vercel (and RESEND_API_KEY + MAIL_FROM for email). `vercel.json` calls `/api/billing/cron` daily at 06:00 UTC (Vercel sends the secret itself). Locally: `npm run cron:run`. Without CRON_SECRET the route refuses to run.
**Rollback:** drop the new tables/columns/functions in reverse migration order; `payments`, `invoices` and `events` keep their original columns. Invoice lines may now be negative and invoice totals may be zero (constraints relaxed).
**Known limits:** `terms` rows (including fee due date) are readable by any school member through the existing table policy; the calendar and dashboard hide fee deadlines from teachers, the raw table does not. Fees by programme/student group and scholarship groups are not modelled (class and individual only). No SMS. Paystack refunds were not run against Paystack (no completed test payment exists to refund). A completed card payment in Paystack test mode has not been performed.

## TermWise-style redesign, learning resources and reports (migrations `20261101090000`, `20261101100000`)

- **Look:** purple theme (`--primary: 263 79% 58%`), sidebar with solid active pill and Settings/profile at the bottom, top bar greeting ("Good afternoon {name}") with centred search, purple page titles with period/date chips, white figure cards with small icon chips and month-on-month trends, coloured Quick Actions tiles, table cards with status pills and progress bars, line and bar charts. Shared pieces: `src/components/kit/Dash.tsx`, `KitStat`.
- **Sign-in:** one page for admin/teacher/student/parent (`/login`, `/admin`) in the reference layout (photo panel left, "Hi, will you sign in now" right). Each role still admits only its own accounts.
- **Admin (principal):** Total Students and Total Staff with trend vs last month, Total Revenue (verified payments, trend vs last month), Outstanding payments; Quick Actions; Payments Collected (6 months) and Attendance Rate (6 months); Class Coverage Breakdown; all earlier panels kept below. Figures from `school_dashboard_trends` and `class_coverage`; money only for `fees.view`.
- **Teacher:** Assigned Classes, Total Students, Today's Classes, Pending Tasks; Today's Classes table (completed / in progress / pending register / upcoming); Quick Actions; Recent Activity (`my_recent_activity`); My Classes with results progress; earlier panels kept.
- **Student / parent:** same cards and fees as before, plus Quick Actions to Results, Resources, Fees, Reports, Timetable.
- **Learning Resources** (`/resources`): files (10 MB, PDF/Word/PowerPoint/Excel/text/CSV/images) or links; whole school or one class, optional subject and folder; teachers add for classes they teach, `resources.manage` anywhere; students/parents see their class only; open counts downloads; archive (no delete).
- **Reports** (`/concerns`): students and parents raise a concern with the principal or one of the student's teachers; pending / in review / resolved with a response; notifications both ways; principal (`concerns.manage`) sees all, a teacher only theirs.
- **Student profile:** School Information (class, class teacher, admission date, years, subjects) and Parent/Guardian tabs.
- Tests: `supabase/tests/resources_concerns.sql` (33 checks).
- **Not built (from the reference images):** CBT (online tests with live proctoring), Virtual Class (live video), Payroll. Each needs its own phase; live video also needs a video provider.

## CBT, Virtual Class and Payroll (migrations `20261102090000` to `20261102140000`)

**CBT** (`/cbt`, exam screen `/cbt/take/:id`)
- Question bank per subject: multiple choice, true/false, short answer (accepted answers, not case-sensitive), essay; marks and difficulty. Teachers write for subjects they teach; `cbt.manage` (admin, headteacher, academic coordinator) for all.
- Tests for one class: window (opens/closes), duration, shuffle, violations allowed. A test stores its own copy of each question, so editing the bank never changes a set test. Publish notifies the class; close ("End for all") submits unfinished attempts.
- Taking a test: the server sets the deadline (start + duration, never past the window), sends questions without the answer key, autosaves every 8 s, refuses saves after the deadline and submits instead. Tab switches, window blur, copy, paste, right-click and leaving full screen are reported; going over the limit terminates the attempt (saved answers are marked).
- Marking is server-side; essays wait for the teacher (Grading tab). Results are released by the teacher only after every essay is graded. Students see their score after release; parents see their child's status and score.
- Live roster (teacher, refreshes every 5 s): status, progress, time remaining, violations per student. Dashboard: tests, upcoming, attempts, pending grading, average score, completion rate, average by class.
- Questions take a picture (PNG/JPEG/GIF/WebP under 500 KB, stored on the question and copied into each test) and LaTeX equations between `$...# Phase 4: subscriptions, Paystack billing, client monitoring and Super Admin access

What was built, how it is secured, how to switch it on, and what is **not** done yet.

## What works today, and what does not

| Area | Status |
| --- | --- |
| Public pricing page, comparison, FAQ, checkout (package, details, review, pay), success / failed / cancelled / pending pages | Built and tested in the browser against the **demo** checkout |
| Server-side pricing, order creation, verification, idempotent settlement, webhook signature check | Built and covered by tests with a **fake Paystack** |
| Real Paystack payments | **Not verified.** Needs your Paystack keys, a public webhook URL and a live end-to-end test (see "Going live") |
| Email (reset links, renewal reminders) | Reset email works through Resend once configured. Reminder **emails are queued only**; in-app reminders work |
| Automatic recurring charges | **Not implemented.** Renewals are manual with reminders, as the pricing page says |
| Refund processing | Order status `refunded` exists and is excluded from revenue. There is no refund screen; refunds are made in the Paystack dashboard |
| Multi-factor sign-in for Super Admin | Not added (depends on the auth provider; Supabase only) |
| Scheduled expiry and reminder job | Built (`audit_monitor_tick`); it must be scheduled (see below) |

## Database (migrations `20261028*`)

| Migration | Adds |
| --- | --- |
| `billing_enum` | Audit actions `payment_verified`, `payment_failed`, `subscription_renewed`, `billing_adjusted`, `password_reset_requested` |
| `billing` | Package fields (yearly price, trial days, storage, public / recommended flags, bullet points); `billing_settings`, `billing_changes`, `billing_orders`, `payment_events`, `subscription_periods`, `reminder_log`; the lifecycle rules; the browser-facing order functions; the server-only settlement functions |
| `billing_platform` | Super Admin reads and actions (clients, client detail, transactions, reconciliation, overview and chart data, package and settings editors, extensions), the School Admin's `my_billing`, and the reminder / expiry tick |
| `billing_guard_fix`, `billing_suspended_access`, `recovery_issue_once`, `portable_random` | Fixes found while testing: gateway chosen at checkout start; a suspended school's admin can still view billing and pay; one reset token per request; no dependency on `pgcrypto` |
| `password_recovery` | `password_reset_requests` and the recovery functions. The local-database token consumption (`local_reset_password`) is in `scripts/local-db/local-auth.sql` |

All billing tables have row-level security on and **no** grants to the API roles. Everything goes through narrow functions.

## Subscription lifecycle

Stored status: `trial`, `active`, `past_due`, `expired`, `cancelled`. The Super Admin also sees `renewal_due` (active and ending within 14 days) and `suspended` (school access restricted), derived by `subscription_label()`. A school with an unpaid checkout is shown under "Awaiting payment" on the payments overview, because a school is only created after its first payment is verified (so there is no "pending payment" school).

Allowed changes (`subscription_transition_ok`): trial to active, past_due, expired, cancelled; active to past_due, expired, cancelled; past_due to active, expired, cancelled; expired to active, cancelled; cancelled to active. Anything else is refused, including from the manual "change status" action.

Server-side timeline (the job calls `billing_reminder_tick()` then `subscriptions_enforce()`):

1. Period ends with no verified renewal: `past_due`, school keeps full access during the **grace period** (default 7 days, editable).
2. Grace ends: `expired`; the school becomes **read-only** (suspended by subscription). Nothing is deleted.
3. A verified renewal sets `active`, extends from the old end date (or today if it had lapsed) and restores access.

Dates are stored as timestamps / dates in the database and compared against the database clock. The browser only displays them.

## Payment flow

1. Browser calls `billing_start_signup` (new school) or `billing_start_order` (School Admin renewing or changing package). The **database** prices the order from the stored plan, adds the configured tax, creates the reference, and returns a claim code held only by that browser.
2. Browser asks `/api/billing/initialize` for a checkout address with just the reference and claim code. The server reads the amount from the order, calls Paystack `transaction/initialize` with the secret key, and returns Paystack's hosted page.
3. Paystack sends the buyer back to `/checkout/return` and, separately, posts a webhook.
4. The return page calls `/api/billing/verify`. The server asks **Paystack** for the transaction and calls `billing_settle`. The redirect and the URL prove nothing.
5. `billing_settle` (server-only) checks status `success`, the **amount and currency against the order**, then in one transaction creates the school (new purchases) or updates the subscription, writes the period, the history entry and the audit entry. Settling again changes nothing.
6. A new school's administrator gets a **one-time** sign-up link on the confirmation page (shown once, to the holder of the claim code) and sets their own password.

Webhook (`/api/billing/webhook`): the HMAC-SHA512 signature is checked on the raw body with the secret key; a bad signature is rejected (HTTP 401) and recorded. A valid `charge.success` is not trusted either: the server confirms with Paystack, then settles. Duplicates are recognised (`payment_events` unique key) and a failed first attempt is not marked as handled, so Paystack's retry still works.

Payment methods are whatever Paystack's hosted page offers for your merchant account, country and currency. The site does not list any method itself and never handles card details.

### Demo checkout

`BILLING_DEMO=on` enables a clearly labelled demo page that stands in for Paystack. It is ignored when `VERCEL_ENV` or `NODE_ENV` is `production`, every order it settles is stored as `gateway = demo`, shown with a **DEMO** tag, excluded from revenue, and its receipt says it is not a real transaction. A demo order cannot be settled through the Paystack path.

### Who can do what

- Super Admin: sees every client, admin, package, dates, payments, reminders, reconciliation, and can extend or change a subscription with a reason. These are **adjustments** with before / after values; they never create a payment and never count as revenue. There is no function that marks an order paid except `billing_settle`, which has no grant to any signed-in role.
- School Admin: sees and pays only their own school's billing (also when the school is read-only). Receipts are only produced for verified payments.
- Everyone else: nothing.

## Super Admin access

- Separate sign-in at `/super-admin/login` (linked discreetly as "Platform administration" on the login pages and the site footer). The link is a convenience; the database decides who is a platform administrator.
- `platformLogin` accepts only accounts listed as platform administrators with no school membership. A school login gets the same "could not sign you in" message as a wrong password. School login pages now refuse platform accounts with a pointer to the Super Admin login.
- Wrong-password lockout (5 failures in 15 minutes) and sign-in attempt records are the existing local-auth ones. Platform administrators are created only with `npm run db:create-platform-admin` (no public sign-up, no password in source).
- New navigation: Platform overview, Clients and schools, Subscriptions, Renewals and expiry, Pricing and packages, Payments, Audit and security, Administrative activity, Support, Platform settings.

### Password reset for a School Admin

Client page, "Profile and admin", "Send password reset": confirm school, name and email; the server emails a single-use link valid for one hour to the admin's own address. The Super Admin never sees a password or the link. Up to 3 requests per hour per account. Each request is audited (no token in the log) and its **real** outcome (sent, failed, used, expired) is shown; a failed send is shown as failed.

- Local database: the billing backend sends the email (Resend, or the dev console log with `MAIL_DEV_LOG=on`, development only). The token is stored as a digest; using it signs out every open session of that login.
- Hosted Supabase / Neon: the provider's own recovery email is triggered and the outcome recorded. **Untested** here.

## Environment variables

Set these in `.env.local` (laptop) or the host's environment (never in the browser or git):

| Variable | Purpose |
| --- | --- |
| `PAYSTACK_SECRET_KEY` | `sk_test_...` or `sk_live_...`. Without it real payments are unavailable |
| `APP_URL` | Public address of the site, used for the Paystack return link (e.g. `https://your-site.example`) |
| `BILLING_DEMO` | `on` to allow the demo checkout (ignored in production) |
| `RESEND_API_KEY`, `MAIL_FROM` | Reset email delivery |
| `MAIL_DEV_LOG` | `on` prints reset links to the server console (development only) |
| `DATABASE_URL` (or the Neon variables) | Connection the billing backend uses to settle orders |

## Going live (not done yet)

1. Create the Paystack account, finish business verification, and enable the payment channels you want (cards, mobile money, ...) in the dashboard.
2. Put `PAYSTACK_SECRET_KEY` (test key first) and `APP_URL` in the host's environment. The backend runs as the functions in `api/billing/*` on Vercel, or inside the Vite dev server on a laptop.
3. In Paystack Dashboard, Settings, API Keys and Webhooks, set the webhook URL to `https://<your-site>/api/billing/webhook`. Paystack signs it with the same secret key. For local testing use a tunnel.
4. Run an end-to-end test with Paystack **test** cards and test mobile money: successful, declined, abandoned, and a repeated webhook. Confirm the school is created once and the amount matches.
5. Schedule the expiry and reminder job. It is the existing monitor: run `npm run audit:monitor` from a scheduler every 5 to 15 minutes (or `npm run audit:monitor:watch` as a service). Nothing marks a subscription past due or sends reminders unless it runs. Run `npm run audit:verify` from a different scheduler to notice if it stops.
6. Connect email (Resend or another provider) if you want reset emails; reminder emails need a small sender added to the queue in `reminder_log` (currently queued only).
7. Set the Terms and Privacy links, support email and phone, tax rate, grace period and reminder days under Platform settings.
8. Replace the placeholder package text and prices under Pricing and packages if they are not final (they are real database rows now, not page text).

## Tests

- `npm run db:test`: `billing_access.sql` (106 checks: server pricing, settlement, idempotency, mismatches, failed / abandoned payments, demo rules, renewals continuing from the end date, price changes not rewriting history, tax, adjustments without payments, lifecycle rules, reminders without duplicates, expiry and restore, access for every role), `local-auth.test.sql` (recovery: single use, expiry, no token in audit, rate limits).
- `npm run billing:test`: the backend with a fake Paystack inside a rolled-back transaction (amount taken from the database, bad and valid signatures, webhook not trusted without Paystack's confirmation, duplicates, mismatch, failed payment retry, demo rules, reset email failure reported as failed).
- Browser-checked: pricing (narrow viewport), full demo purchase, one-time sign-up link, billing history and receipt, School Admin refused at the Super Admin login, client list and detail, password reset end to end, expired school restored by a verified renewal.
- Pricing and checkout were checked for horizontal overflow at phone, tablet and desktop widths (one tablet overflow found and fixed).
- Not tested: real Paystack, real email, hosted-provider reset, and the Super Admin pages at tablet and desktop widths.

## Platform console additions

- **Super Admin team** (`/platform/admins`): any active Super Admin can add another. The server route `POST /api/billing/platform-admin` checks the caller through the database (`is_platform_admin`), creates the login (local: `auth_local.create_platform_admin`; hosted: Neon Auth sign-up), generates a 16-character temporary password shown once, and records the new admin through `platform_admin_register`. Admins can be switched off and restored (`platform_admin_set_disabled`); nobody can switch themselves off and the last active admin cannot be switched off. `is_platform_admin()` ignores switched-off admins.
- **My account** (`/platform/profile`): name, sign-in email (password re-checked first, `platform_admin_change_my_email`) and password change.
- **System health** (`/platform/health`): `platform_health()` counts plus the scheduled-check status.
- **Platform overview** gained subscription, revenue and "needs attention" panels from `platform_billing_overview`.
- Migration `20261030090000_platform_team.sql`. A new hosted admin has no forced password change (Neon Auth); the dialog tells the giver to ask them to change it on first sign-in.

## Platform roles and invitations (migration `20261030120000_platform_roles.sql`)

- **Roles**: Super Admin (everything), Platform Admin, Billing Admin, Support Admin. Each admin row holds a role and an explicit permission list (`module.view` / `module.manage`: clients, billing, support, audit; plus `settings.manage`, `health.view`, `admins.manage`). Role presets are in `platform_role_preset()` and mirrored in `src/lib/platformRoles.ts`. Existing admins became Super Admins.
- **Enforcement**: every platform database function checks its own permission (`platform_can` / `platform_require`); the migration rewrites the old "any platform admin" guard in each function. Routes and sidebar items follow the same permissions, but the database is what refuses direct calls.
- **Anti-escalation**: nobody changes their own role, only a Super Admin makes or changes a Super Admin, others can grant only permissions they hold, and the last active Super Admin cannot be demoted or switched off.
- **Invitations**: `/platform/admins` -> Invite. The server stores only the SHA-256 of a one-time 7-day link; the invitee sets their own password at `/platform-invite` (12+ characters). No password is generated, shown or emailed. If email is not configured the inviter is shown the one-time link instead. Resend rotates the link; revoke kills it.
- **Password reset for another admin**: sends the provider's reset email; the Super Admin never sees a password.
- Tests: `supabase/tests/platform_roles.sql` (21 checks).
- Not built yet: per-action create/edit/suspend/approve/export permissions (only view/manage), invite-accept audit entries, login/session history, forced email verification on email change.

## Platform operations (migration `20261030140000_platform_ops.sql`)

- **Event log** (`platform_events`, `/platform/events`): append-only (a trigger refuses edits and deletes). Records sign-ins, invitations, role/access changes, switch-off/restore, sign-in email changes, announcements, report views, transaction exports and support assignments, with actor, time, subject and detail. Never stores passwords or tokens. Viewed with `audit.view`; every administrator can read their own history on their account page.
- **Finer permissions**: `clients.create`, `clients.suspend`, `billing.export`, `announcements.manage` added. Presets updated; `/platform/roles` shows the matrix.
- **Announcements** (`/platform/announcements`): draft, publish, unpublish, archive; type (notice / maintenance / product update); audience (everyone, school administrators, teachers, students, parents); optional start and end time; reach count. Published ones appear as a banner for the audience (`my_platform_announcements`).
- **Analytics and reports** (`/platform/reports`): any date range up to three years; revenue by month and package, registrations, paid/pending/failed counts; CSV download. Demo payments excluded.
- **Invoices and receipts** (`/platform/invoices`): paid orders with receipt PDF from the stored order (`platform_receipt`). Transaction export needs `billing.export` and is logged.
- **School onboarding / administrators / usage**: read-only views from real records (counts only, no pupil data). Schools activate when payment is verified, so there is no separate approval queue.
- **Support**: requests can be assigned to a platform administrator (`support_assign`).
- **Recovery and backups**: the database is Neon Postgres; backups and point-in-time restore are provided and controlled in the Neon console, not from this app. To recover: restore the branch in Neon to the wanted time, point `DATABASE_URL` at it, redeploy. No destructive data controls were added to the console.
- Not applicable / not built: discounts and promotions (no such billing model), help documentation, forced email verification on sign-in email change (Neon Auth flow not confirmed), session revocation of other devices (password change already signs others out on the local login).

## School fee audit and online payments (migration `20261030160000_fee_online_payments.sql`)

**Audit of what existed (Phase 3G):** `fee_structures`, `invoices` + `invoice_lines` (NUMERIC(12,2) money), `payments` (recorded/voided, sequential receipt numbers), `fee_counters`, permission-gated `record_payment` / `void_payment` / `cancel_invoice` / `generate_invoices` (no duplicates per structure+student), `send_fee_reminders`, parent and staff fee pages, PDF invoice/receipt, in-app `notifications`, guardian-only visibility (`is_guardian_of`), fee audit events. Academic years and terms exist as tables (one current each) with no management UI; `events` backs a simple calendar.

**Added now:** parents pay an invoice (full or part) through Paystack.
- `fee_payment_orders` (+ `fee_payment_events`): one row per attempt, amount/currency/invoice/payer fixed in the database; references `FEE-...`, separate from platform `billing_orders`.
- `fee_pay_start` (caller must be a verified guardian; amount must be 0 < x <= balance from the ledger; invoice locked), server routes `/api/billing/fee-initialize` and `/fee-verify`, and the shared `/api/billing/webhook` (FEE references are routed to fee settlement).
- `fee_settle` is server-only and idempotent: Paystack's own answer is fetched by the server; amount and currency must equal the order; only `success` writes a `payments` row (method `paystack`, linked by `order_id`, UNIQUE). Failed/abandoned/mismatched never touch the ledger. Two competing payments cannot over-collect: the second is recorded as `excess` and finance is notified (refund/credit decision is manual).
- Receipt number comes from the existing counter; guardians, the student and finance staff get in-app notifications from the settled record; a notification failure cannot undo a payment.
- UI: Pay online panel in the parent invoice dialog, `/fees/return` confirmation page, and an "Online payments" tab for finance (attempts, review list, excess).
- Verified: 30+ new database checks, 4 server tests with a fake Paystack, and in Paystack TEST mode a real initialize and a real verify of an abandoned checkout (no ledger change). A completed card payment in Paystack test mode was NOT performed. No live charge has been made.
- Rollback: `DROP TABLE fee_payment_orders CASCADE` after removing `payments.order_id`, restore the old `payments_method_check`; no existing rows are changed.

**Not built yet (gaps against the full spec):** academic year/term management screens and lifecycle states, per-term fee due dates and reminder schedules, fee structures by programme/student group/scholarship, discounts and waivers ledger, refunds (only void), student self-payment, email delivery of confirmations and reminders (in-app only), notification centre filters/retry state, role calendars with visibility/publish/cancel, reconciliation against Paystack's transaction list, collection reports by term/class/category, scheduled reminders for fees. 

## Fees completed, academic periods and calendar (migrations `20261031100000` to `20261031170000`)

**Academic periods** (Fees > Periods): years and any number of terms/semesters per school, with status (draft, published, completed, archived; periods also closed), fee due date, reminder days, exam and break dates; no overlaps, dates must sit inside the year; publish the calendar (tells the school); close a period (nothing is deleted, no further edits). The existing Classes setup page still creates years and terms; the new fields change only through `save_term`, `set_term_fee_due`, `close_term` etc. (direct column writes are revoked).
**Fee due date = one source of truth:** `terms.fee_due_on`. Fees linked to a period (`fee_structures.term_id`) raise invoices with that date. `set_term_fee_due` needs a reason, moves unpaid invoices of that period, notifies families, and writes the audit record. Paid invoices are untouched.
**Adjustments:** discount, scholarship, waiver or charge (`apply_fee_adjustment`, permission `fees.adjust`): immutable `fee_adjustments` rows plus a visible invoice line; cannot take the invoice below what is already paid; family notified; audited.
**Offline payment approval** (setting): payments wait as `pending`, are not counted as paid and not announced; approver needs `payments.approve` and cannot be the recorder. Duplicate references are refused.
**Students** see their own invoices and statements; paying is off unless the school switches it on. **Teachers** see only a one-word status for their own class and only if granted `fees.status`.
**Refunds:** `fee_refund_begin` (needs `payments.refund`) reverses the payment in the ledger (kept as voided "Refunded: ..."), and an online refund is sent to Paystack by `/api/billing/fee-refund`; failures are recorded and retryable; excess money can be refunded too.
**Reconciliation:** "Check pending payments with Paystack" and the scheduled job re-verify stuck attempts with Paystack; only what Paystack confirms is applied.
**Reminders and email:** `fee_reminder_tick` (before-due days per period, overdue days per school) sends each (invoice, stage, due date, person) once and names the remaining balance; `calendar_reminder_tick` does the same for events. Both write in-app notifications and queue emails in `notification_outbox`, sent by `/api/billing/cron` (retries up to 5, tracked separately from the payment/event).
**Reports:** `fee_report` (settled ledger only): assessed, discounts, charges, online/offline, gross, refunds, reversals, net, outstanding, overdue, status counts, by class/period/category/method, daily/monthly. CSV export needs `fees.export` and is audited. Statements: PDF per student.
**Calendar:** events have draft/published/cancelled, description, all-day, class targeting, reminders, history and audit; publishing, moving and cancelling notify exactly the audience; cancelling needs a reason; staff-only and draft events are hidden from students and parents by row-level security; overlaps are shown as a warning.
**Scheduled job setup:** set `CRON_SECRET` on Vercel (and RESEND_API_KEY + MAIL_FROM for email). `vercel.json` calls `/api/billing/cron` daily at 06:00 UTC (Vercel sends the secret itself). Locally: `npm run cron:run`. Without CRON_SECRET the route refuses to run.
**Rollback:** drop the new tables/columns/functions in reverse migration order; `payments`, `invoices` and `events` keep their original columns. Invoice lines may now be negative and invoice totals may be zero (constraints relaxed).
**Known limits:** `terms` rows (including fee due date) are readable by any school member through the existing table policy; the calendar and dashboard hide fee deadlines from teachers, the raw table does not. Fees by programme/student group and scholarship groups are not modelled (class and individual only). No SMS. Paystack refunds were not run against Paystack (no completed test payment exists to refund). A completed card payment in Paystack test mode has not been performed.

## TermWise-style redesign, learning resources and reports (migrations `20261101090000`, `20261101100000`)

- **Look:** purple theme (`--primary: 263 79% 58%`), sidebar with solid active pill and Settings/profile at the bottom, top bar greeting ("Good afternoon {name}") with centred search, purple page titles with period/date chips, white figure cards with small icon chips and month-on-month trends, coloured Quick Actions tiles, table cards with status pills and progress bars, line and bar charts. Shared pieces: `src/components/kit/Dash.tsx`, `KitStat`.
- **Sign-in:** one page for admin/teacher/student/parent (`/login`, `/admin`) in the reference layout (photo panel left, "Hi, will you sign in now" right). Each role still admits only its own accounts.
- **Admin (principal):** Total Students and Total Staff with trend vs last month, Total Revenue (verified payments, trend vs last month), Outstanding payments; Quick Actions; Payments Collected (6 months) and Attendance Rate (6 months); Class Coverage Breakdown; all earlier panels kept below. Figures from `school_dashboard_trends` and `class_coverage`; money only for `fees.view`.
- **Teacher:** Assigned Classes, Total Students, Today's Classes, Pending Tasks; Today's Classes table (completed / in progress / pending register / upcoming); Quick Actions; Recent Activity (`my_recent_activity`); My Classes with results progress; earlier panels kept.
- **Student / parent:** same cards and fees as before, plus Quick Actions to Results, Resources, Fees, Reports, Timetable.
- **Learning Resources** (`/resources`): files (10 MB, PDF/Word/PowerPoint/Excel/text/CSV/images) or links; whole school or one class, optional subject and folder; teachers add for classes they teach, `resources.manage` anywhere; students/parents see their class only; open counts downloads; archive (no delete).
- **Reports** (`/concerns`): students and parents raise a concern with the principal or one of the student's teachers; pending / in review / resolved with a response; notifications both ways; principal (`concerns.manage`) sees all, a teacher only theirs.
- **Student profile:** School Information (class, class teacher, admission date, years, subjects) and Parent/Guardian tabs.
- Tests: `supabase/tests/resources_concerns.sql` (33 checks).
- **Not built (from the reference images):** CBT (online tests with live proctoring), Virtual Class (live video), Payroll. Each needs its own phase; live video also needs a video provider.

## CBT, Virtual Class and Payroll (migrations `20261102090000` to `20261102140000`)

**CBT** (`/cbt`, exam screen `/cbt/take/:id`)
- Question bank per subject: multiple choice, true/false, short answer (accepted answers, not case-sensitive), essay; marks and difficulty. Teachers write for subjects they teach; `cbt.manage` (admin, headteacher, academic coordinator) for all.
- Tests for one class: window (opens/closes), duration, shuffle, violations allowed. A test stores its own copy of each question, so editing the bank never changes a set test. Publish notifies the class; close ("End for all") submits unfinished attempts.
- Taking a test: the server sets the deadline (start + duration, never past the window), sends questions without the answer key, autosaves every 8 s, refuses saves after the deadline and submits instead. Tab switches, window blur, copy, paste, right-click and leaving full screen are reported; going over the limit terminates the attempt (saved answers are marked).
- Marking is server-side; essays wait for the teacher (Grading tab). Results are released by the teacher only after every essay is graded. Students see their score after release; parents see their child's status and score.
- Live roster (teacher, refreshes every 5 s): status, progress, time remaining, violations per student. Dashboard: tests, upcoming, attempts, pending grading, average score, completion rate, average by class.
, drawn with KaTeX on the exam screen, bank and marking view.
- Question Bank → Import reads a CSV (template provided), checks every row in the browser and again in `cbt_questions_import`; all rows go in or none do.
- Not built: webcam proctoring (needs a decision on recording minors, consent and storage).

**Virtual Class** (`/virtual-class`, room `/virtual-class/:id`)
- Teachers schedule a lesson for a class they teach (`vclass.manage` for any); students are notified; the teacher starts it, students of that class can join only while live; parents see the schedule and recordings but cannot enter.
- Video runs in an embedded Jitsi Meet room with an unguessable name, returned by the server only to people allowed in. Default server `meet.jit.si` (free, no account; it may ask the first person, the teacher, to sign in with Google/GitHub to start a room). Set `VITE_JITSI_DOMAIN` to use a self-hosted or paid (8x8 JaaS) Jitsi.
- Attendance is recorded automatically (join, heartbeat every 30 s, leave); hosts see minutes per person. Recordings are added as links after the class (Jitsi on meet.jit.si does not record to our servers).
- Figures: total, live, upcoming today, students online, sessions per month, attendance rate per month.

**Payroll** (`/payroll`; staff without payroll rights see "My Payslips")
- Salary profiles (basic, currency, grade, bank, account, TIN; on/off payroll), allowances and deductions (fixed or % of basic; for everyone or one person), salary advances (request up to 3× basic, repaid monthly; decided by an approver who is not the requester).
- Monthly run: create → calculate (payslips, warnings such as missing bank account) → approve by `payroll.approve`, never the person who created or calculated it → mark paid with a bank reference (advances reduced, staff notified). Approved/paid runs cannot be recalculated or cancelled. One run per month.
- Payslips as PDF for staff and payroll officers; account numbers masked on payslips. Dashboard with status steps and activity log; full audit tab.
- Permissions: `payroll.manage` (school admin, finance officer), `payroll.approve` (school admin, headteacher). A school with only one administrator needs a headteacher or a second approver to approve payroll.
- Payroll → Tax & SSNIT: PAYE bands (GRA resident monthly rates as the default, editable) and SSNIT employee/employer rates. When switched on, calculation adds SSNIT and PAYE lines to each payslip; PAYE is charged on basic + allowances − employee SSNIT. A statutory summary gives PAYE and SSNIT totals per month.
- Approved or paid runs have a Bank file (CSV) for the bank's bulk payment upload. Full account numbers leave the database only through `payroll_bank_file`, and each export is logged.
- Not built: direct bank payment (needs a bank API or Paystack Transfers account).

Tests: `supabase/tests/cbt_vclass_payroll.sql` (55 checks). The scheduled job also submits expired CBT attempts.
