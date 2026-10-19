# Tech Oasis School: website audit and improvement notes

Audit date: 2026-10-10. Scope: public website (`index.html`, `course.html`, `verify.html`), sign-in and portal entry pages, admin settings.
Everything below was confirmed by reading the code and by running it in a browser, unless marked otherwise.

## 1. What the project is

| Item | Finding |
|---|---|
| Stack | Static site, vanilla JavaScript, Tailwind via CDN, Font Awesome, Google Fonts. No build step. |
| Routing | Public site is one page (`index.html`) with hash views (`#catalog`, `#about`, `#contact`). Portals use real paths rewritten by `vercel.json`. |
| Data | **Everything (accounts, courses, orders, certificates, reviews) lives in each visitor's browser (`localStorage`)** and is seeded from `assets/js/core/seed.js`. There is no server, database, email or payment gateway. `db/schema.sql` is a ready Postgres/Supabase schema for the move to a backend. |
| Auth | Passwords are hashed (PBKDF2) but checked in the browser. Roles (student, staff, admin) are enforced in client code only. |
| Deployment | Vercel static hosting, config in `vercel.json` (rewrites, and now security headers). |

Consequence: until a backend exists, the site is a complete working **demo** of a school platform. It cannot receive a sign-up, a payment, a contact message or a certificate verification from another person. This is documented in the README ("Before launch") and is now shown honestly to visitors (see section 3).

## 2. Issues found, by priority

### Critical (visitors were told something untrue)
| # | Issue | Status |
|---|---|---|
| C1 | "Pay now" marked an order **paid** in the browser (`demo-…` reference) and showed "Payment received". No gateway exists. | **Fixed.** Online payment is off (`lms.onlinePayments()` returns false); the checkout explains how to pay by email and never records a payment. Admins can still mark an order paid after receiving money outside the site. |
| C2 | Newsletter form said "You're subscribed" but only wrote to the visitor's own browser. | **Fixed.** Form removed (replaced by a contact call to action). |
| C3 | Public homepage showed learner reviews, star ratings and an "average from N reviews" that come from **sample seed data**. | **Fixed.** Sample reviews are hidden by default (and migrated for browsers that already hold them). Ratings and testimonials appear only for real, published reviews. Admin → Reviews can still publish them. |
| C4 | Certificate preview showed "Your Name" / `TOS-2026-XXXXXX` as if it were a credential; "employers can confirm it in seconds". | **Fixed.** Labelled "Sample certificate", placeholder values, honest verification wording. |
| C5 | `verify.html` showed a green "Verified" badge for any record found in the visitor's browser. Anyone can edit their own browser storage, so the badge proved nothing. | **Fixed (wording).** The page now says verification is not online and labels a local match "Found in this browser, not independently verified". **Real fix needs a server** (section 5). |
| C6 | Forgot-password and "Apply to teach" confirmations claimed the school had been notified or an email sent. Nothing leaves the browser. | **Fixed (wording).** Both pages and the sign-in/register pages say plainly that data is saved in this browser only and tell the visitor to email the school. One switch, `TOS.config.serverConnected` in `assets/js/core/ui.js`, removes every one of these notices once a backend is live. |
| C7 | "Most popular", "Trending", "Recognised achievement" and similar claims were driven by sample enrolments. | **Fixed.** Neutral labels ("Featured programmes", "Newest programmes", "AI & Data programmes"). |

### High
| # | Issue | Status |
|---|---|---|
| H1 | Footer social icons, Terms and Privacy linked to `#`. | **Fixed.** Dead links removed. Social links and a phone number appear only when the school enters them (Admin → Settings → School). Terms/Privacy pages do not exist: see section 6. |
| H2 | No contact form; contact was email links only. | **Fixed.** New Contact page with validation. Because no server can receive it, it opens the visitor's email app with the message filled in and says nothing is sent until they press Send. |
| H3 | Role-selection "welcome" modal existed but was never opened anywhere (dead code). | **Removed.** Header links go straight to `/student/login`; the footer links staff to `/staff/login`. Nothing blocks the public site. |
| H4 | Four homepage sections repeated the same few course cards; the long page buried the journey. | **Fixed.** Homepage restructured into a clear journey (section 4). The "What brings you here" filter section duplicated the catalogue's level filter and was removed. |
| H5 | Pricing/trial copy did not say what actually happens. | **Fixed.** Copy now matches the code: trial needs no payment details, nothing is charged automatically, lessons lock when the trial ends until payment is arranged, one-time price per programme, certificate has no extra fee. |
| H6 | Sub-pages (course, verify) used a different header/footer to the homepage. | **Fixed.** `chrome.js` now mirrors the homepage navigation and footer. |

### Medium
| # | Issue | Status |
|---|---|---|
| M1 | Font Awesome 6.4.0 had no X icon (blank footer button). | Fixed earlier (6.5.2). |
| M2 | Several small text colours failed WCAG AA contrast (slate 400/500, gold 600). | **Fixed** in `assets/js/tw.js` and `student.css`. The gold "OASIS" part of the logo on light backgrounds is still below 4.5:1; logotypes are exempt from WCAG contrast rules, so it was left as the brand mark. |
| M3 | Catalogue sort `<select>` had no label; heading levels skipped; auth pages had no `<main>`. | **Fixed.** |
| M4 | FAQ used `<details>`; answers were generic and partly unverifiable (e.g. certificate, pricing). | **Rebuilt** as an accessible accordion (buttons, `aria-expanded`, keyboard). Answers are generated from real settings. Refunds and payment methods are **not** answered (not defined by the school). |
| M5 | No `robots.txt`, `sitemap.xml`, structured data, descriptions on sub-pages; private pages were indexable. | **Added.** Admin, portal and lesson pages are `noindex`. |
| M6 | No security headers. | **Added** to `vercel.json`: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`. |
| M7 | 1.6 s splash screen on first visit delayed content. | Shortened to 0.6 s. |
| M8 | Mixed "program"/"programme" spelling on public pages. | Standardised to "programme" on public pages (portals still say "program"). |

### Not fixable without a backend or business input (see sections 5 and 6)
Real certificate verification, real contact/enrolment/password-reset delivery, real payments, server-side permissions, rate limiting, file-upload validation, email.

## 3. Honesty switch

`TOS.config.serverConnected` (default `false`) controls every "stored in this browser only" notice. When you connect a real backend, set it to `true` in `assets/js/core/ui.js`, and re-check `lms.onlinePayments()` in `assets/js/core/lms.js` once a gateway and webhook exist.

## 4. Design and structure

**Palette decision.** The brief suggested a navy palette. The existing identity (logo, favicon, certificate, every page) is deep forest green with gold, and it is clearly established, so it was **kept** and consolidated rather than replaced. Tokens: forest `#0C3B2E`, forest-600 `#14584A`, gold `#C4A649`, ink `#0A1F1A`, ivory `#FBF8F1`, white, slate for text/borders. If you do want navy, the whole palette lives in `assets/js/tw.js` and `:root` in `assets/css/tos.css`.

What changed:
- One content width (1200 px) and one header height; section spacing standardised.
- Radii reduced: cards `rounded-xl`, containers `rounded-2xl` (was 24–36 px on most blocks). Buttons and inputs 8 px.
- Removed decorative blurred blobs, grain overlays and gradient glows from the public pages.
- A single section label style (`.eyebrow`), a single main-navigation style (`.nav-link`) with `aria-current` active state, visible focus rings (forest on light, gold on dark).
- Course cards now show category, title, description, level, hours, lessons, instructor, price, certificate note, "View course".

Homepage order: Navigation → Hero (outcome headline, two CTAs, sliding programme photos with a matching featured-course card) → Explore our programmes (category tabs, real course data, "View all courses") → Why Tech Oasis School → How learning works (6 steps) → Featured/new/AI & Data (with the hover previews) → Career paths (auto-rotating tabs) → Technologies strip → Organisations / AI promo → Certificate (sample) → Reviews (only if real) → Pricing and free trial → FAQ → Contact call to action → Footer.

Navigation: Home, Courses, For Individuals (how it works), For Organisations, About, Contact, Sign in, Explore courses. Hamburger menu below 1280 px with focus handling and Escape. The header search box was replaced by a search icon that opens the catalogue's live search (the box did not fit beside six links); the mobile menu keeps its search field.

Follow-up changes after review:
- **Photos.** The stock thumbnails behind the hero and the two promo cards were replaced by the four photos supplied by the school (`assets/img/*.webp`, resized and compressed: 20 to 72 KB each). The hero slides through the four photos with four programmes from different categories. `study-desk.webp` is only 768 px wide, so it looks soft when shown full width; supply a larger original if you can.
- **Staff sign in.** "Sign in" in the header (and on the course, verify and mobile menus) now opens a small menu with **Student sign in** and **Staff dashboard sign in** (`/staff/login`). It is keyboard accessible (Escape closes it, focus returns).
- **Staff sign-in page.** Redesigned after the reference you supplied, in the brand greens: a gradient page with one card, forest-green panel on the left carrying the **animated Tech Oasis mark** (`ui.animatedLogo`, same artwork and animation as the splash screen), white curved form panel on the right with filled fields and icons, a SHOW/HIDE password toggle, Remember me, Forgot password, a primary Sign in button, an "or" divider and a **Student sign in** button (in place of the reference's "Sign in with other"). The curved white panel belongs to the form column, so its curve follows the card's height and never cuts into the text when notices such as "You have been signed out" make the card taller (an earlier version used a fixed-size circle and clipped the heading in that case). The other staff pages (apply, reset password) keep the earlier layout.
- **Course catalogue page.** Redesigned after the third reference, in the brand greens: a forest banner with the page title, a large search box and a green-tinted photo (the supplied blue laptop picture, desaturated); a filter panel on the left (categories, level and price as checkboxes with counts, a min/max price range, Clear filters; it collapses behind a Filters button on phones); a results bar with the count, a sort menu and a grid/list toggle; richer cards (category, title, description, level, hours, lessons, instructor, price, certificate note, View course); numbered pagination (9 per page); and a closing "Can't find what you're looking for?" banner that links to the Contact page. Categories, levels and price now combine (several can be ticked at once) and older links such as `go('catalog', null, {price:'free'})` still work. **Not built from the reference:** the bookmark icon on each card (there is no saved-courses page, so it would do nothing) and the "Get Notified" button (there is no server to store or send notifications; the banner links to Contact instead). The price range only appears when courses have different prices; with the current data (Free and $5) it is a 0 to 5 range.
- **Scroll hints.** The category tabs ("Explore our programmes") and the career-path tabs show an edge fade and a round arrow button on the side that has more to scroll to. The category row also pans slowly back and forth by itself while it is on screen; the panning stops for good as soon as the student touches, clicks, scrolls or tabs into the row, pauses while the mouse is over it, and is off under reduced motion. Nothing shows when all the tabs fit.
- **Student sign in / create account.** `/student/login` and `/student/register` now share one card modelled on the second reference: a forest-green panel carrying the animated Tech Oasis mark slides between the two forms (below 768 px the panel is hidden and a text link switches forms). The covered form is `inert`, focus moves to the first field after switching, and the URL and page title update. The reference's Google/Facebook/GitHub/LinkedIn buttons were **not** added: there is no server to complete a social sign-in, and a button that does nothing would be a fake feature. The register form now validates in code (name, email format, password of at least 8 characters). The sentence "By creating an account you accept the school's Terms of Use and Privacy Notice" was removed because those documents do not exist yet.
- **Student dashboard.** Restructured: smaller greeting (no emoji), one compact stat strip instead of four large cards, a "Continue learning" panel (or, for new learners, "Start your first course" with three steps and three suggested courses, free ones first), and a right-hand column for progress, assignments, events and announcements. Empty states are one line each. Streak and due chips only show when relevant.

Not built because no genuine content exists (do not invent it): student projects showcase, testimonials, instructor profiles on the homepage, a Ghana cedi price display (needs a reliable rate source or an agreed fixed rate; checkout currency is shown as `Prices are in USD`).

## 5. Backend and security: what is required

Nothing here can be done honestly in a static site. Work needed, in order:
1. Create the database from `db/schema.sql` (Supabase/Postgres), enable Row Level Security (notes are in the schema), and replace `LocalStorageAdapter` and the functions in `auth.js`, `staff.js`, `api.js`, `staff-api.js` with API calls.
2. Authentication on the server (sessions/JWT), password hashing server-side, admin and staff permissions enforced by RLS or API middleware. Today the admin passcode is checked in the browser and the README lists sample credentials; **change/remove them before launch**.
3. Certificates: store issued certificates server-side with unguessable IDs; `verify.html` should query an endpoint that returns only name, course, date and status (never email or other personal data) and handles missing, revoked and invalid IDs.
4. Payments: Paystack, Flutterwave or Stripe, orders marked paid only by the provider's webhook. Then switch `lms.onlinePayments()` on.
5. Contact form and notifications: an endpoint (or a service such as Resend/Formspree) so messages reach `school@techoasisltd.com`; wire `email_outbox`.
6. Server-side validation, rate limiting on sign-in/contact/reset, file-type and size validation for uploads, CSRF protection if cookies are used.
7. A Content-Security-Policy. Not added now because the Tailwind CDN needs inline/eval; it becomes possible once Tailwind is compiled (section 7).

Client-side items already in good shape: HTML is escaped on output (`ui.esc`), social links must be `https://` (a `javascript:` URL is rejected), the `?code=` parameter on the verify page is escaped (tested with an `<img onerror>` payload), passwords are never stored in plain text, no secrets exist in the repo (there are no API keys or `.env` files).

## 6. Content and business decisions needed

| Needed | Why |
|---|---|
| **Privacy Policy and Terms of Service** (and a **Refund Policy** if refunds are offered) | The site collects names, emails and learning data. These pages do not exist; their dead footer links were removed. |
| Refund policy and **accepted payment methods** | Not defined anywhere in the code; the FAQ deliberately does not answer them. |
| Whether the $5 price and 7-day trial are final | They are settings (`payments.defaultPrice`, `payments.trialDays`). The page now reads them, so changing the setting changes the site. |
| Real instructor names, photos, roles and bios; confirm the four sample instructors | `Clifford Mensah`, `Dr. Kofi Mensah`, `Ama Owusu`, `Tunde Bakare`, etc. come from seed data. I could not verify them. They still appear on course cards and the About page. |
| Confirm the 12 sample programmes are the real catalogue | Courses, lessons and descriptions are seed data ("Start fresh" in Admin → Settings → School → Data removes sample content). |
| Genuine, permissioned learner testimonials and project showcases | The reviews section and a projects section will not appear until real ones exist. |
| Official social accounts, phone/WhatsApp | Enter in Admin → Settings → School. Nothing is shown until supplied. |
| Social sharing image (`og:image`) and a logo PNG | None exists; Open Graph tags have no image. |
| Confirm the production domain | Canonical, Open Graph, `sitemap.xml` and `robots.txt` use `https://school.techoasisltd.com` (already set in School settings). If the live site stays on `techoasis-school.vercel.app`, change them. |
| Certificate rules | Read from settings: 100 % lessons, quizzes passed, assignments graded ≥ 50 %. Confirm. |
| Course-level details | Per-course prerequisites exist in the data model (`requirements`); check each course has them filled. |

## 7. Performance

- Tailwind runs in the browser from the CDN (`cdn.tailwindcss.com`). It is the largest avoidable cost (it compiles styles in the browser on every visit) and the reason no CSP is possible. Recommended: compile once with the Tailwind CLI (`tw.js` is the config) and ship a static CSS file. Not done here because the project has no build step and the brief says to preserve the deployment setup.
- Card images are requested at 640 px instead of 900 px; below-the-fold images are lazy; the hero image is `fetchpriority="high"`; career-path images are preloaded when idle.
- Splash screen shortened.
- The old three-slide hero carousel was replaced by a hero whose background photo slides through programmes from different categories (automatic every 6 s; only the visible Pause button stops it, and choosing a dot restarts the timer. Visitors with reduced motion still get the automatic change but without the sliding animation). Only the first photo loads eagerly; the rest are lazy.

## 8. Tests actually run

Run in a headless Chromium against a local copy of the site. In this environment the Tailwind CDN, Font Awesome, Google Fonts and Unsplash are **blocked**, so a locally compiled Tailwind stylesheet was substituted for testing and icons/photos did not load. Layout results are therefore reliable but not pixel-identical to production.

| Check | Result |
|---|---|
| JavaScript syntax (`node --check`, every `.js`) | pass |
| Homepage/navigation/catalogue/contact/FAQ/honesty script (71 assertions) | 71 passed, 0 failed |
| Flow script: course page, registration, trial enrolment, forced `payNow`, portal pages, role denial, verify page (valid / invalid / revoked / XSS), notices (31 assertions) | 31 passed, 0 failed |
| Horizontal overflow at 320, 390, 768, 1024, 1440, 1920 px on home, catalogue, about, contact | none |
| Internal links on home, catalogue, about, contact, course, verify | 27 checked, 0 broken, 0 `#` placeholders |
| Console errors across all flows | none |
| axe-core (WCAG 2.0/2.1 A and AA, best practice) on 7 pages × 2 widths | only remaining finding: the gold "OASIS" in the logo (see M2) and one "region" note on the sign-in page's skip link |
| Lighthouse (local, CDN blocked) | Accessibility 97, Best practices 96, SEO 100. Performance 73 is **not representative** because external assets time out here. Run Lighthouse against the deployed site to get real numbers. |

**Not tested** (needs credentials, services or a real device): real payments, real email, real certificate verification against a server, cross-browser (Safari/Firefox), real phones, screen readers, the Vercel deployment itself, anything on the live URL (the sandbox cannot reach it), admin pages beyond loading the settings form.

## 9. Environment variables

None are required today. When a backend is added you will need, for example: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (public), `SUPABASE_SERVICE_ROLE_KEY` (server only, never in browser code), the payment provider's secret key and webhook secret, and an email provider key. Keep them in Vercel → Project → Settings → Environment Variables, never in the repository.

## 10. Run and deploy

Run locally (needs the rewrites for `/student/*`, `/staff/*`, `/admin`):
```bash
npx serve -l 5501      # serve.json provides the rewrites
```
Deploy: merge to `main`; Vercel builds on push (no build command, no output directory). Preview deployments are created for every pull request. After deploying, hard-refresh and re-run Lighthouse on the live URL.

## 11. Remaining known issues
- All data is browser-local (section 1). The honesty notices must be removed only after the backend work in section 5.
- Portals (student, staff, admin) were audited for loading, role denial and the payment/enrolment flow, but were **not** redesigned; they still use the earlier visual style and "program" spelling.
- Course pages and the portals still show sample instructor names and sample content until replaced.
- Tailwind CDN in production (see section 7).
- The auto-rotating career-path tabs and hover cards added earlier were kept.
