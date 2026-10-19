# Tech Oasis School

Online learning platform: public website, student learning experience and an admin LMS/CMS.
Static site (no build step): Tailwind via CDN, vanilla JavaScript, deployable as-is to Vercel or any static host.

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Public homepage, catalogue, about and contact (hash views). **Sign in** goes to `/student/login`; the footer links to staff sign-in and *Teach at Tech Oasis* |
| `/student/*` (`portal.html`) | **Student Portal**, a separate signed-in app: dashboard, my courses, browse, course curriculum, lesson player, assignments, quizzes, certificates, progress, messages, announcements, notifications, calendar, schedule, resources, profile, settings, help |
| `/staff/apply` (`portal.html`) | Public teaching application (4 steps). Applications start **Pending**; nobody can sign in until an admin approves. `/staff/application` shows the applicant their status and messages |
| `/staff/*` (`portal.html`) | **Staff Portal** for approved staff: dashboard, my courses (lessons, assignments, quizzes), students, grading, quiz results, messages, announcements, schedule, notifications, profile, settings. Each menu item and API call is gated by the permissions the admin granted |
| `course.html?c=<slug>` | Course landing page (curriculum, instructor, reviews, enrollment). `&preview=1` = admin preview incl. drafts |
| `learn.html?...&preview=1` | Admin lesson preview (students are redirected to `/student/learn/:lessonId`) |
| `verify.html?code=<id>` | Certificate view, print/PDF, public verification |
| `admin.html` (`/admin`) | Admin CMS, including **People → Staff Applications** (review, request info, approve with role/permissions/courses, reject) and **People → Staff** (edit, permissions, suspend, ban, unban, archive, soft delete, force password reset). Queued emails: **Settings → Email Outbox**.<br>Admin CMS (sample sign-in: `school@techoasisltd.com` / `admin123`. **Change it in Settings → School before launch**; the passcode is checked in the browser, so real admin security needs the backend below) |

## Code map

```
assets/js/core/db.js      Relational store: tables, foreign keys, cascades, ordering, persistence adapter
assets/js/core/lms.js     Domain logic: curriculum tree, authoring, progress, quizzes, assignments,
                          certificates, checkout, analytics
assets/js/core/video.js   Video provider registry (YouTube, Vimeo, MP4/WebM, Bunny, Cloudflare, Loom, embed)
assets/js/core/crypto.js  SHA-256 / PBKDF2 password hashing and tokens (no password is ever stored in plain text)
assets/js/core/auth.js    Accounts, sessions, account-status checks at sign-in (+ migration that hashes old passwords)
assets/js/core/staff.js   Staff applications, approval, roles & permissions, account lifecycle, password resets, audit trail, email outbox
assets/js/core/staff-api.js Staff API: session, status, permission and course-ownership checks on every call
assets/js/core/engage.js  Notifications (row triggers), messaging + permissions, calendar, support tickets, notes, student IDs
assets/js/core/kit.js     Dashboard kit shared by every dashboard: welcome banner, stat cards, panels, quick actions, schedule,
                          bar/line/donut charts, mini calendar, data table (search, filters, sort, pages, loading/empty/error)
assets/js/core/api.js     Student API: the only data interface the portal uses (session + ownership checks)
assets/js/student/*.js    Portal shell/router shared by both portals (S.APPS.student / S.APPS.staff), plus the student portal: sign-in, dashboard, courses, learning, work, comms, academic, account
assets/js/core/seed.js    Sample content (12 programs; "Web Development" has the full 6-section curriculum)
assets/js/staff/*.js      Staff portal: shell config, public apply/login/reset pages, dashboard & communication, teaching & grading
assets/js/admin/*.js      CMS screens (courses + builder, lesson editor, learning, people, staff, commerce, analytics, settings)
assets/js/pages/*.js      Public pages
db/schema.sql             PostgreSQL/Supabase schema matching db.js one-to-one
```

Content hierarchy: **Course → Sections → Lessons → Content items**, with Quiz / Assignment / Resources attached to lessons
(resources can also attach to a whole course). Enrollment, LessonProgress, QuizAttempt, Submission and Certificate link students to that tree by ID.

Add a video host: `TOS.video.register({ id, label, match(url), parse(url), thumbnail(ref), mount(el, item, hooks) })`.

## Run locally

The portals use real paths (`/student/dashboard`, `/staff/dashboard`), so the server must rewrite `/student/*` and `/staff/*` to `portal.html`.
`vercel.json` (Vercel) and `serve.json` (`npx serve`) already do this:

```bash
npx serve -l 5501
```

Student sign-in: `/student/login` (sample student: `margaret@gmail.com` / `student123`). Staff: `/staff/login`
(sample instructor: `instructor@techoasisltd.com` / `staff123`). Admin: `/admin`. Two sample applications are waiting in
**Admin → Staff Applications**.

VS Code Live Server: `.vscode/settings.json` sets `"liveServer.settings.file": "portal.html"`, so unknown paths fall back to the
portal. **Restart Live Server after changing that setting**, or `/student/login` and `/staff/login` show *Cannot GET*.

## Audit notes

See [`docs/AUDIT.md`](docs/AUDIT.md) for the full website audit: what was wrong, what changed, what still needs a backend or business decision, and the tests that were run.
`TOS.config.serverConnected` (in `assets/js/core/ui.js`) is `false` until the data lives on a server; while it is `false`, pages that collect or promise something say plainly that it is stored in this browser only. Online payment is switched off in `lms.onlinePayments()` until a gateway exists. Public contact details and social links are filled in at **Admin → Settings → School** and appear on the site only once entered.

## Before launch (important)

This build stores all data **in each visitor's browser** (`localStorage`). It is a complete, working product demo, but a real
school needs shared, server-side data. To launch:

1. **Database + auth:** create the tables in `db/schema.sql` (e.g. on Supabase), enable Row Level Security, and replace
   `LocalStorageAdapter` in `db.js` / the functions in `auth.js`, `staff.js`, `api.js` and `staff-api.js` with API calls.
   Admin access, staff permissions and account status must be enforced server-side (see the RLS notes in `schema.sql`).
   Hook `email_outbox` up to an email provider so verification, approval and reset emails are actually sent.
2. **Payments:** connect Paystack, Flutterwave or Stripe. Orders must be marked paid by the provider's webhook, never by the browser.
3. **File storage:** host videos on a video provider and files in object storage (uploads are limited to 1 MB in the demo).
4. **Content:** in **Admin → Settings → School → Data**, export a backup, then **Start fresh** to remove the sample
   courses, students, orders and reviews before adding your own.
