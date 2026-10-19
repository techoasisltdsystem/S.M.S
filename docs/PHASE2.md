# Phase 2: connected dashboards

Five dashboards read one set of school records. What each person sees is decided by the database (Row-Level Security), not by the screen.

## What works
- **Super Admin** (`/platform`): school counts, new schools by month, people totals, register a school (single-use invitation link), suspend or restore with a required reason (kept in the audit log). Counts only: the database gives platform admins no view of pupil records.
- **School Admin** (`/dashboard`, laid out like the reference): students, classes, parents, staff, boys/girls donut, class distribution, attendance today, results waiting, upcoming events, new enrolments, recent activity.
- **Teacher**: today's classes, student count, results to submit, registers due, quick links, results workflow, class averages, rule-based alerts (attendance under 80% or average under 50%), notices, calendar, schedule, reminders. The AI cards from the reference are replaced by real actions (take attendance, enter marks).
- **Student** and **Parent** (child switcher; verified children only): average, subjects, results, class position, attendance, recent results, notice board, calendar.
- **Pages behind them**: classes and academic setup, timetable, students (enrol, transfer, withdraw, guardian link and verify), attendance, results (draft, submit, approve, publish, reopen with reason), calendar and notices.
- Marks are hidden from students and parents until published. Guardian links give nothing until the school verifies them. Past attendance can only be corrected with `attendance.correct`.

## What is not built
- Fees, payments, finance widgets (Phase 5; the dashboards say so).
- Platform service health, subscriptions, support tickets, school approval documents.
- Editing or deleting years, terms, classes, events and notices (the database has no such policies yet).
- Laptop sign-in has no second factor; hosted Supabase does. Hosted Supabase is still not created (free-plan limit).

## Verify
```
npm run db:test                  # 3 test files; academics_access.sql has 61 checks
npm run db:create-platform-admin # then sign in at /admin
npm run db:create-school
npm run dev:local
```
Sign in as each role: the menu, the dashboard and the data change, and a hand-built request for another school's or another child's rows returns nothing.
