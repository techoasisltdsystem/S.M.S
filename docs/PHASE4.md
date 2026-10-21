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
