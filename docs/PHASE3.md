# Phase 3A: staff roles and private messaging

## What works
- **Staff roles**: headteacher, academic coordinator, librarian and receptionist join the accountant/bursar (`finance_officer`) and auditor. They use the administrator layout; what they can open depends on permissions. Librarians and receptionists land on a small home page because they have no student records by default.
- **Roles and permissions** (`/role-permissions`, School Admin): switch a fixed list of permissions on or off per staff role for your school. User management, settings, audit log and refunds cannot be handed out. Every change is audited (`set_role_permission`).
- **Messages** (`/messages`, every role): inbox, threads, replies, unread badge in the top bar (refreshes every 15 s), recipient search limited to people you may contact.
- **Who can message whom** is decided in the database (`can_message_profile`): admins reach everyone in their school; staff reach staff; teachers reach verified guardians of pupils they teach; parents reach office staff, admins and teachers of their verified children; students only when the school turns it on, and then only their own teachers, admins and office staff. Revoking a guardian link stops the parent and the teacher writing to each other.
- **Privacy**: only participants can read a conversation. School and platform administrators cannot browse them. A participant can report one message; a school admin with `messages.moderate` sees only reported messages and can hide one with a reason (audited). Starting a conversation is audited without its text.

## Not built yet
- Attachments, group-wide announcements to chosen classes with read receipts and scheduling, push/email notifications (messages refresh by polling).
- Fees, subscriptions/packages, support requests, audited support access for the Super Admin.
- Visual redesign of the dashboards beyond the new landing hero.

## Verify
```
npm run db:migrate
npm run db:test    # messaging_access.sql adds 59 checks
```

# Phase 3B: result corrections, notifications and downloads

## What works
- **Approval is a school setting** (Exams → Policy and grading): require approval before publishing (default on), and require approval for corrections to published results (default on). With approval off, the subject teacher publishes their own submitted results.
- **Corrections**: after publication a score changes only through `request_correction` / `decide_correction`. The published result stays unchanged while a correction waits. Each change keeps the previous value (`result_versions`), and the audit log records old and new score and grade, feedback, reason, requester and approver. A direct edit of a published mark is refused by the database. Students and parents are read-only.
- **Grading scale** (admin sets it): grades appear on reports only if the school has configured bands; none are invented.
- **Notifications** (`/notifications`, bell with unread count): result published, result corrected, correction waiting or rejected. They never contain scores and link to the signed-in results page.
- **Downloads**: PDF, Excel and CSV for a student report (student, verified parent, teacher for their subject, school office) and for class results (teacher for their classes and subjects, school office). Data comes from `student_report` / `class_results`, which re-check the caller on every request, return published marks only, and write a `report_exported` audit entry.

## Limits to know
- Files are drawn in the browser from authorised data; nothing is stored or linked, so there are no download links to expire.
- Notifications are in-app only (no email or push) and refresh every 30 seconds.
- `profiles.admission_number` exists and appears on reports, but the add-student form does not ask for it yet.
- Not built: assignments with student submissions and file uploads, online exams, audit-failure incidents and Super Admin alerts.

## Verify
```
npm run db:migrate
npm run db:test    # results_access.sql adds 77 checks
```

# Phase 3C: audit failure monitoring

## What works
- **Tamper-evident log**: every audit record is hash-chained to the previous one (per school, plus a platform chain) and can never be updated, deleted or truncated. `audit_verify_chain()` reports altered, missing or truncated records.
- **No silent failures**: a *sensitive* action (results, roles, permissions, parent links, attendance corrections, school settings, grading scale, message moderation) is refused with error code `AU001` if its audit record cannot be written, so the change and its record commit together. A *routine* action succeeds, its audit event goes to a durable retry queue, and an incident opens at once. Retries use an event key, so no duplicates.
- **Health check** (`audit_run_health_check`): writes and reads back a probe record (rolled back), retries the queue, verifies every chain, and reconciles published results, applied corrections and hidden messages against their audit records. It opens incidents (deduplicated, with occurrence counts), escalates to Critical when failures repeat past a threshold, and records each run.
- **Super Admin** (`/platform/audit`, shield icon with a count in the top bar): status banner, open incidents by severity, incident list and detail with diagnostics and timeline, alerts with read tracking, recent health checks, settings (threshold, window, silence limit, urgent channel). Actions: acknowledge, assign to another platform admin, note, resolve (note required), run verification, close.
- **Closing needs proof**: an incident closes only after it is resolved and a verification run made *after* the fix passes. If the problem recurs the incident reopens.
- **Alerts** carry reference, time, school, module, category, severity, operation/event reference, whether the business action completed, next steps and status. They hold codes and ids only: no passwords, tokens, error text or student/parent details.
- **Monitor job** (`scripts/audit-monitor.mjs`): `npm run audit:monitor` (one run), `audit:monitor:watch` (loop), `audit:verify` (independent check that the monitor is still reporting). It delivers the urgent-channel outbox to `AUDIT_ALERT_WEBHOOK_URL` (Slack-compatible). If the database is unreachable or the check crashes it alerts the webhook directly and writes `logs/audit-monitor-alerts.log`, so a broken audit service cannot silence its own alarm.

## Limits to know
- A refused sensitive change cannot save its own incident (the whole transaction rolls back). The app reports it (`report_audit_failure`, medium severity, rate-limited) and the next health check's write probe finds persistent failures. Browser sessions on the Neon provider do not report automatically yet.
- Run the monitor job on a schedule (Task Scheduler, cron, or any host). Run `audit:verify` from a *different* scheduler than the main job for real independence. Nothing sends email or SMS; the urgent channel is a webhook.
- Reconciliation covers published results, applied corrections and hidden messages. Other sensitive actions rely on the refuse-if-unlogged rule.
- Incident references use a sequence, so numbers can skip.

## Verify
```
npm run db:migrate
npm run db:test            # audit_monitoring.sql adds 70 checks
npm run audit:monitor      # one health check
```

# Phase 3D: assignments, online exams and submissions

## What works
- **One record for everything**: assignments and exams are the existing `assessments`, extended with instructions, opening time, deadline, duration, submission format, allowed file types and sizes, late rule, attempts, rubric, and a release stamp. Marks, approval, publication, corrections, reports and downloads are unchanged.
- **Teacher** (Exams and results → assessment): set the rules when creating it, attach files, **Release to class** (students and verified parents are notified; withdrawing is refused once a student has started), watch who has handed in, open each student's work, and **return it for resubmission** with a note. Entering a mark moves the submission to Marked. Scores are never changed automatically, including for a late penalty (a suggested deduction is shown while marking).
- **Student** (`/assignments`): list of released work with status and deadline; read instructions and rubric, download teacher attachments, write an answer (autosaved) and/or upload files, hand in with a confirmation and receipt. Statuses: working, handed in, handed in late, returned, marked. Timed online exams start a server-side clock when the student presses Start; handing in after it ends is refused (or marked late if the teacher allows late work). Several attempts if the teacher allows them.
- **Eligibility**: only students actively enrolled in the class can see, start or submit; other classes, other schools, parents and unreleased work are refused by the database. Suspended schools cannot start or submit.
- **Files**: stored in the database with no public URLs; read through `get_file`, which re-checks the caller each time (own student or the marking teacher; teacher attachments for the released class). Checked on upload: extension allow-list (pdf, docx, xlsx, pptx, txt, csv, png, jpg), file signature must match the type, no double extensions or paths, size and count limits.
- **Audit and notifications**: release, submission and return are audited; students get a receipt notification, the teacher is told of new work.

## Limits to know
- Online exams are timed written responses; there are no multiple-choice questions or automatic grading yet.
- Files are limited to 10 MB (5 by default) because they are kept in the database. There is no virus scanning; only type and signature checks.
- Parents see that an assignment was released (notification) but not their child's submission.
- Browser files are base64-encoded for upload, so very large files are slow.

## Verify
```
npm run db:test   # assignments_access.sql adds 74 checks
```

# Phase 3E: Super Admin console

## What works
- **Plans and subscriptions** (`/platform/subscriptions`): plans (Starter, School, Campus; existing schools moved to an Unlimited plan so nothing changed for them) with student and staff limits, a monthly price and feature switches. Per school: plan, status (trial, active, past due, expired, cancelled), paid-until and trial dates, grace days. Every change needs a note and is kept in the subscription history (before and after) and the school's audit log. New schools start a 30-day trial of the School plan.
- **Enforced in the database**: student and staff limits stop new invitations past the limit; messaging, assignments, report downloads and custom role permissions are refused when the plan lacks them. A lapsed subscription keeps working for the grace period, then the school becomes read-only (suspended) until it is renewed. A manual suspension by the platform is never undone by a renewal.
- **School administrator** (`/subscription`): plan, standing, usage meters, included features, history. (`/support`): support requests with replies, and approval of support access.
- **Support requests**: schools open requests; the platform replies and sets status; schools are notified of replies and can close or reopen.
- **Support access** (`/platform/support`): a platform admin asks with a reason (at least 20 characters) for 1–24 hours; the school's administrator approves, declines or withdraws it. Access is read-only and limited to settings, plan and staff accounts. It never covers pupils, parents, marks, attendance or messages. Request, approval, every use and the end are written to the school's own audit log. Only the requester can use an approval; it stops when it expires.
- **Platform activity** (`/platform/activity`): filter by school, action, affected record, person and dates, with paging. Names are shown only for school-level records (classes, subjects, assessments, settings); people's names, free-text reasons and emails are never shown.
- **Compromised administrator**: disable or restore a school administrator's account with a reason; access ends immediately; audited; an alert is raised if a school is left with no active administrator.

## Limits to know
- There is no payment processing: the platform records payments by changing the paid-until date.
- Expiry is applied by the monitor job (`npm run audit:monitor`) and immediately whenever the platform changes a subscription.
- Plan features beyond the four enforced ones (exams, attendance, timetable, fees, parent sign-in, audit log) are shown on plans but not yet switched off in the app.

## Verify
```
npm run db:test   # platform_console.sql adds 79 checks
```

# Phase 3F: announcements with targeting, scheduling and read status

## What works
- **Audiences**: everyone, all staff, teachers only, students, or parents, optionally limited to one or more classes. For a class, "students" are those enrolled, "parents" are verified guardians of them, "teachers" are the class's subject and form teachers. One database function decides who a notice reaches, and the same rule governs who can read it, who is counted and who is notified.
- **Who may post**: the school office to any audience; a teacher only to students and parents of classes they teach. Everyone else is refused by the database.
- **Before sending**: the dialog shows how many students, parents and staff the choice reaches and asks for confirmation. Nothing confidential goes to the whole school by accident; private matters stay in Messages.
- **Scheduling**: a notice can be set for a later time (up to 180 days). Until then only its author and the office see it, and nobody is notified. The monitor job (or the next posting) delivers it once.
- **Delivery and read status**: each recipient gets a notification; the author and the office see "Read by X of Y". A notice counts as read when it appears on the board for someone allowed to see it.
- **Corrections and withdrawal**: the author or the office can fix the wording or withdraw a notice (it disappears for its audience and stays visible, marked, to the author and office). Posting and withdrawing are audited with the audience size.

## Limits to know
- Read figures count people who opened the notice board, not people who read the text.
- Notifications are in-app only; there are no attachments on notices.
- The monitor job must run for scheduled notices to be delivered on time; a new posting also delivers anything that is due.

## Verify
```
npm run db:test   # announcements_access.sql adds 42 checks
```

## 3G. Fees and payments (and admission numbers)

- **Admission numbers**: per-school sequence, assigned on enrolment, editable by staff with the `students.manage` permission (audited).
- **Fee structures** (`save_fee_structure`, `list_fee_structures`): name, amount, optional class, due date, active flag.
- **Invoices**: `generate_invoices` bills a whole class once per structure (a unique index prevents double-billing); `create_invoice` makes a one-off invoice with lines; `cancel_invoice` needs a reason and is refused once a payment exists.
- **Payments**: `record_payment` locks the invoice, refuses overpayment and numbers receipts (RCT-YYYY-NNNN); `void_payment` needs a reason of 10+ characters. Nothing is deleted.
- **Access**: staff with `fees.view` / `payments.record` / `payments.refund`; a parent sees only their own children's invoices (`is_guardian_of`). Students have no access.
- **Audit**: invoice/payment actions are high-risk (refused with AU001 if they cannot be logged). Notifications and the platform activity log never carry amounts or student names.
- **Subscriptions**: `fees` is a plan feature; a plan without it refuses new invoices/payments, a suspended school takes no new payments, records stay readable.
- **UI**: `/fees` (staff: Overview / Invoices / Fee structures; parent: own children), Finance Overview on the admin dashboard, invoice and receipt PDFs generated in the browser.
- **Limits**: payments are recorded manually by staff; there is no online payment gateway. Tests: `supabase/tests/fees_access.sql` (76 checks).
