-- Tech Oasis School LMS: production schema (PostgreSQL / Supabase)
--
-- Mirrors the tables and relations in assets/js/core/db.js one-to-one, so the front end can switch
-- from the browser storage adapter to an API/Supabase adapter without changing the data model.
--
-- Hierarchy:  Course -> Sections -> Lessons -> Content items (+ Quiz, Assignment, Resources)
-- Learners:   Enrollment (student x course), LessonProgress (student x lesson), Certificate (student x course)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
create type user_role         as enum ('student', 'staff', 'admin');
create type publish_status    as enum ('draft', 'published');
create type course_status     as enum ('draft', 'published', 'archived');
create type course_visibility as enum ('public', 'unlisted', 'private');
create type lesson_type       as enum ('video', 'article', 'document', 'quiz', 'assignment', 'download', 'external');
create type content_kind      as enum ('video', 'article', 'document', 'external');
create type video_status      as enum ('draft', 'processing', 'ready', 'error');
create type question_type     as enum ('single', 'multiple', 'truefalse');
create type enrollment_status as enum ('active', 'trial', 'completed', 'cancelled');
create type progress_status   as enum ('not_started', 'in_progress', 'completed');
create type submission_status as enum ('submitted', 'late', 'graded', 'returned');
create type order_status      as enum ('pending', 'paid', 'refunded', 'failed');
create type payment_status    as enum ('succeeded', 'refunded', 'failed');
create type resource_access   as enum ('enrolled', 'public');

-- ---------------------------------------------------------------- people
create table users (
  id            uuid primary key default gen_random_uuid(),   -- = auth.users.id when using Supabase Auth
  role          user_role not null default 'student',
  name          text not null,
  email         text not null unique,
  -- student record (editable only by admins unless noted)
  student_id    text unique,                 -- e.g. TOS20260001, assigned on creation
  status        text not null default 'active'
                check (status in ('active', 'suspended', 'banned', 'archived', 'deleted')),  -- deleted = soft delete, row kept
  password_hash text,                        -- pbkdf2-sha256$iter$salt$hash (or Supabase Auth); NEVER plain text, never readable by admins
  must_change_password boolean not null default false,  -- set by "Force password reset"
  -- staff account (role = 'staff'); role and permissions are written ONLY by admins, never by the staff member
  staff_role    text check (staff_role in ('instructor', 'teaching_assistant', 'content_editor', 'coordinator')),
  permissions   text[] not null default '{}',   -- view_courses, manage_lessons, create_assignments, create_quizzes, grade_students,
                                                -- view_students, message_students, manage_schedule, post_announcements
  department    text,
  title         text,                        -- public title shown on course pages
  application_id uuid,                       -- the staff_applications row this account was approved from
  program       text,
  class_name    text,
  phone         text,                        -- student-editable
  bio           text,                        -- student-editable
  avatar_url    text,                        -- student-editable
  prefs         jsonb not null default '{}', -- notification, email, privacy and appearance preferences
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table instructors (                      -- public profile; optional login via user_id
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references users(id) on delete set null,
  active     boolean not null default true,       -- false while the linked staff account is not active (hidden on course pages)
  name       text not null,
  title      text,
  bio        text,
  avatar_url text,
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- staff applications & accounts
-- Application, account and permissions are three separate things:
--   staff_applications             = someone asking to teach (public, no login)
--   users (role 'staff')           = the account, created only when an admin approves an application
--   users.staff_role / permissions = what that account may do, decided only by an admin
create table staff_applications (
  id               uuid primary key default gen_random_uuid(),
  status           text not null default 'pending'
                   check (status in ('pending', 'under_review', 'approved', 'rejected', 'withdrawn')),
  first_name       text not null,
  last_name        text not null,
  email            text not null,             -- lower-cased; one open/approved application per email (see index)
  phone            text,
  location         text,
  date_of_birth    date,
  photo_url        text,
  expertise        text,
  experience_years int,
  qualifications   text,
  education        text,
  teaching_history text,
  bio              text,
  subjects         text[] not null default '{}',   -- what they would like to teach (the admin decides the actual role)
  courses_interest text[] not null default '{}',
  preferred_level  text,
  preferred_method text,
  availability     text,
  documents        jsonb not null default '[]',    -- [{kind, name, url}] in object storage
  cv_url           text,
  password_hash    text,                       -- chosen at apply time; moved to users.password_hash on approval, then cleared
  email_verified_at timestamptz,
  info_requested   boolean not null default false,
  messages         jsonb not null default '[]',    -- applicant <-> school thread shown on the status page
  admin_notes      jsonb not null default '[]',    -- INTERNAL: never returned to the applicant
  rejection_reason text,                       -- optional, shown to the applicant
  staff_user_id    uuid references users(id) on delete set null,
  reviewed_by      text,
  decided_at       timestamptz,
  submitted_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index staff_applications_open_email on staff_applications (email)
  where status in ('pending', 'under_review', 'approved');
alter table users add constraint users_application_fk
  foreign key (application_id) references staff_applications(id) on delete set null;

-- Append-only history of every application decision and account action (approve, suspend, ban, delete, ...)
create table staff_audit (
  id             uuid primary key default gen_random_uuid(),
  action         text not null,
  user_id        uuid references users(id) on delete set null,
  application_id uuid references staff_applications(id) on delete set null,
  by_name        text,
  detail         jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

-- Email verification and password reset links. Only the SHA-256 of the token is stored.
create table password_resets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  purpose    text not null default 'reset',
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- Stand-in for the email provider (Resend, Postmark, SES...): a worker sends queued rows.
create table email_outbox (
  id         uuid primary key default gen_random_uuid(),
  "to"       text not null,
  subject    text not null,
  body       text not null,                   -- never contains a password
  kind       text,
  status     text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- catalog
create table categories (                       -- parent_id null = category, otherwise subcategory
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references categories(id) on delete cascade,
  name        text not null,
  slug        text not null,
  icon        text,
  description text,
  "order"     int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table courses (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  slug                text not null unique,
  short_description   text,
  description         text,                   -- markdown
  thumbnail_url       text,
  category_id         uuid references categories(id) on delete set null,
  subcategory_id      uuid references categories(id) on delete set null,
  level               text not null default 'Beginner',      -- Beginner | Intermediate | Advanced (configurable)
  language            text not null default 'English',
  estimated_hours     numeric(6,1),                          -- null = derived from lesson durations
  price               numeric(10,2) not null default 0,
  is_free             boolean not null default false,
  certificate_enabled boolean not null default true,
  requirements        jsonb not null default '[]',
  outcomes            jsonb not null default '[]',           -- "What students will learn"
  audience            jsonb not null default '[]',
  status              course_status not null default 'draft',
  visibility          course_visibility not null default 'public',
  discussions_enabled boolean not null default true,
  sequential          boolean not null default false,
  featured            boolean not null default false,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Supports multiple instructors per course from day one (role 'lead' is the primary instructor)
create table course_instructors (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references courses(id) on delete cascade,
  instructor_id uuid not null references instructors(id) on delete cascade,
  role          text not null default 'lead',
  "order"       int not null default 0,
  unique (course_id, instructor_id)
);

-- ---------------------------------------------------------------- curriculum
create table sections (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references courses(id) on delete cascade,
  title       text not null,
  description text,
  "order"     int not null,
  status      publish_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on sections (course_id, "order");

create table lessons (
  id                  uuid primary key default gen_random_uuid(),
  section_id          uuid not null references sections(id) on delete cascade,  -- course via section (not duplicated)
  title               text not null,
  slug                text not null,
  summary             text,                      -- short description
  body                text,                      -- full lesson description (markdown)
  type                lesson_type not null,
  "order"             int not null,
  duration_min        int not null default 0,
  is_preview          boolean not null default false,
  status              publish_status not null default 'draft',
  discussions_enabled boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (section_id, slug)
);
create index on lessons (section_id, "order");

-- A lesson has one or more content items. Video provider is data, not code: any provider id
-- registered in assets/js/core/video.js (youtube, vimeo, file, bunny, cloudflare, loom, embed, ...).
create table contents (
  id           uuid primary key default gen_random_uuid(),
  lesson_id    uuid not null references lessons(id) on delete cascade,
  kind         content_kind not null,
  "order"      int not null default 1,
  -- video
  provider     text,
  url          text,
  provider_ref text,                -- e.g. YouTube video id
  duration_sec int,
  thumbnail_url text,
  captions     jsonb not null default '[]',     -- [{lang, label, url}]
  transcript   text,
  video_status video_status,
  -- article
  body         text,
  -- document / external
  file_name    text,
  size_bytes   bigint,
  label        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table quizzes (
  id             uuid primary key default gen_random_uuid(),
  lesson_id      uuid not null unique references lessons(id) on delete cascade,
  title          text not null,
  instructions   text,
  passing_score  int not null default 70 check (passing_score between 0 and 100),
  time_limit_min int not null default 0,          -- 0 = none
  max_attempts   int not null default 0,          -- 0 = unlimited
  shuffle        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table quiz_questions (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references quizzes(id) on delete cascade,
  type        question_type not null,
  prompt      text not null,
  options     jsonb not null,                    -- [{id, text}]
  correct     jsonb not null,                    -- [option ids]; never sent to students before submit
  explanation text,
  points      int not null default 1,
  "order"     int not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table assignments (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null unique references lessons(id) on delete cascade,
  title       text not null,
  instructions text,
  due_date    timestamptz,                       -- fixed due date, or
  due_days    int,                               -- days after enrolling
  max_score   int not null default 100,
  allow_file  boolean not null default true,
  allow_text  boolean not null default true,
  rubric      jsonb not null default '[]',       -- [{criterion, description, points}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Belongs to a course OR a lesson (exactly one)
create table resources (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid references courses(id) on delete cascade,
  lesson_id  uuid references lessons(id) on delete cascade,
  name       text not null,
  file_type  text not null,
  url        text not null,                      -- storage path or URL
  size_bytes bigint,
  access     resource_access not null default 'enrolled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((course_id is null) <> (lesson_id is null))
);

-- ---------------------------------------------------------------- learning records
create table orders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references users(id) on delete set null,
  coupon_id  uuid,                                -- fk added after coupons
  subtotal   numeric(10,2) not null,
  discount   numeric(10,2) not null default 0,
  total      numeric(10,2) not null,
  currency   char(3) not null default 'USD',
  status     order_status not null default 'pending',
  provider   text,
  paid_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table enrollments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  course_id         uuid not null references courses(id) on delete cascade,
  order_id          uuid references orders(id) on delete set null,
  status            enrollment_status not null default 'active',
  enrolled_at       timestamptz not null default now(),
  trial_ends_at     timestamptz,
  completed_at      timestamptz,
  current_lesson_id uuid references lessons(id) on delete set null,
  last_access_at    timestamptz,
  source            text,
  unique (user_id, course_id)
);

create table lesson_progress (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,
  lesson_id          uuid not null references lessons(id) on delete cascade,
  status             progress_status not null default 'in_progress',
  video_position_sec int not null default 0,
  video_watched_pct  int not null default 0,
  watch_seconds      int not null default 0,
  last_watched_at    timestamptz,
  completed_at       timestamptz,
  updated_at         timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create table quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references quizzes(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  answers      jsonb not null,                    -- {question_id: [option ids]}
  score        numeric(8,2),
  max_score    numeric(8,2),
  percent      int,
  passed       boolean,
  started_at   timestamptz not null default now(),
  submitted_at timestamptz
);
create index on quiz_attempts (user_id, quiz_id);

create table submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  text          text,
  files         jsonb not null default '[]',      -- [{name, size, url}] in storage
  status        submission_status not null default 'submitted',
  submitted_at  timestamptz not null default now(),
  score         numeric(8,2),
  rubric_scores jsonb not null default '{}',
  feedback      text,
  graded_at     timestamptz,
  graded_by     uuid references users(id) on delete set null,
  unique (assignment_id, user_id)
);

-- Certificates are permanent records: snapshot fields keep the certificate stable if the course
-- or student is later renamed or deleted.
create table certificates (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,           -- e.g. TOS-2026-AB12CD (public verification id)
  user_id         uuid references users(id) on delete set null,
  course_id       uuid references courses(id) on delete set null,
  student_name    text not null,
  course_title    text not null,
  instructor_name text,
  school_name     text not null,
  hours           numeric(6,1),
  issued_at       timestamptz not null default now(),
  revoked         boolean not null default false,
  revoked_reason  text
);

-- ---------------------------------------------------------------- commerce
create table coupons (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  type       text not null check (type in ('percent', 'fixed')),
  value      numeric(10,2) not null,
  course_id  uuid references courses(id) on delete cascade,  -- null = all courses
  max_uses   int not null default 0,                         -- 0 = unlimited
  used       int not null default 0,
  expires_at timestamptz,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table orders add constraint orders_coupon_fk foreign key (coupon_id) references coupons(id) on delete set null;

create table order_items (
  id        uuid primary key default gen_random_uuid(),
  order_id  uuid not null references orders(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  price     numeric(10,2) not null
);

create table payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  amount       numeric(10,2) not null,            -- negative for refunds
  currency     char(3) not null,
  provider     text not null,
  provider_ref text,                              -- provider transaction id (set by webhook)
  status       payment_status not null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- engagement
create table reviews (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  rating     int not null check (rating between 1 and 5),
  comment    text,
  status     text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, user_id)
);

create table discussions (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references courses(id) on delete cascade,
  lesson_id   uuid references lessons(id) on delete cascade,
  parent_id   uuid references discussions(id) on delete cascade,     -- replies
  user_id     uuid references users(id) on delete cascade,           -- null = staff/team post
  author_name text,
  body        text not null,
  created_at  timestamptz not null default now()
);

create table announcements (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid references courses(id) on delete cascade,         -- null = school-wide
  title       text not null,
  body        text not null,
  important   boolean not null default false,                        -- pinned + shown on calendars
  event_date  timestamptz,
  author_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- student portal
create table announcement_reads (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references announcements(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (announcement_id, user_id)
);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  type       text not null,          -- enrollment | lesson | assignment_due | assignment_graded | quiz_available | quiz_result |
                                     -- course_completed | certificate | message | announcement | schedule | support | system | submission
  title      text not null,
  body       text,
  link       text,                   -- portal route, e.g. /student/learn/<lesson id>
  key        text,                   -- de-duplication key (e.g. one due-soon reminder per assignment)
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);
create index on notifications (user_id, read_at);

-- recipient_user_id = the instructor; null = the support / administration team
create table conversations (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references users(id) on delete cascade,
  recipient_type    text not null check (recipient_type in ('instructor', 'support', 'admin')),
  recipient_user_id uuid references users(id) on delete set null,
  course_id         uuid references courses(id) on delete set null,
  subject           text not null,
  status            text not null default 'open',
  last_message_at   timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid references users(id) on delete set null,   -- null = support/admin team
  sender_name     text not null,
  sender_role     text not null check (sender_role in ('student', 'instructor', 'admin')),
  body            text not null,
  attachments     jsonb not null default '[]',
  read_at         timestamptz,                                     -- read by the other party
  created_at      timestamptz not null default now()
);
create index on messages (conversation_id, created_at);

create table calendar_events (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid references courses(id) on delete cascade,      -- null = whole school
  title       text not null,
  type        text not null check (type in ('class', 'exam', 'quiz', 'deadline', 'event', 'holiday')),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  all_day     boolean not null default false,
  location    text,
  url         text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Assignment deadlines and important announcements are added to each student's calendar at query time.

create table lesson_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  lesson_id  uuid not null references lessons(id) on delete cascade,
  body       text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create table support_tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  category   text not null,            -- technical | course | payment | account | other
  subject    text not null,
  body       text not null,
  status     text not null default 'open' check (status in ('open', 'answered', 'closed')),
  replies    jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  source     text,
  created_at timestamptz not null default now()
);

create table settings (                          -- one row per group: school, courses, certificates, payments
  "group"    text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- future modules (reserved, not yet used)
-- These plug into the existing keys without changing the tables above:
--   live_sessions        (course_id, section_id?, starts_at, provider, join_url)
--   learning_paths       (title, slug)  + learning_path_courses (path_id, course_id, order)
--   bundles              (title, price) + bundle_courses (bundle_id, course_id)
--   subscription_plans   (name, price, interval) + subscriptions (user_id, plan_id, status, period_end)
--   badges               (code, name, icon, rule) + user_badges (user_id, badge_id, awarded_at)
--   points_ledger        (user_id, points, reason, ref)       -> leaderboards
--   referrals            (referrer_id, referred_user_id, code, reward_status)
--   forums/threads       (generalise discussions with a forum_id)
--   ai_conversations     (user_id, course_id, lesson_id, messages jsonb)   -> AI tutor / course assistant
--   certificate_purchases(certificate_id, order_id)            -> paid certificates

-- ---------------------------------------------------------------- row-level security (Supabase)
-- Enable RLS on every table and add policies. Minimum set:
--   * Student portal (/student/*): every student-owned table (notifications, conversations + messages, lesson_notes,
--     support_tickets, announcement_reads) is readable/writable only where user_id/student_id = auth.uid().
--     Students may update only phone, bio, avatar_url and prefs on their own users row.
--   * Suspended users (status = 'suspended') are denied by every policy.
--   * Published courses/sections/lessons: readable by anyone.
--   * quiz_questions.correct: never selectable by students. Grade attempts in an RPC/edge function.
--   * enrollments, lesson_progress, quiz_attempts, submissions, orders: a student reads/writes only rows
--     where user_id = auth.uid().
--   * certificates: readable by code for public verification.
--   * Everything else (writes to catalog, grading, payments, settings): admin/staff role only.
--   * orders.status = 'paid' is set ONLY by the payment provider webhook, never by the browser.
--   * Staff portal (/staff/*): a staff user reads/writes only courses linked to them through course_instructors, and
--     every write checks the matching permission in users.permissions server-side (RPC / edge function).
--     Staff may update only phone, bio, avatar_url, title and prefs on their own row; never role, staff_role,
--     permissions, department or status. Any account whose status <> 'active' is denied by every policy.
--   * staff_applications: insert-only for the public, through an edge function that hashes the password and rate-limits.
--     The applicant reads their own row through an RPC that strips admin_notes and password_hash. Admins read/write all.
--   * password_hash columns, staff_audit, password_resets, email_outbox: never selectable from the browser.
--   * A banned email cannot open a new application until an admin lifts the ban (checked in the apply function).
