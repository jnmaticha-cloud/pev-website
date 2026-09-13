# Prime Elite Ventures — Website

Full-stack corporate site: Node/Express backend (REST API, JWT auth,
role-based access, a full content-management layer, photo/file uploads,
and a job-application pipeline with scoring) serving a vanilla HTML/CSS/JS
frontend across **three portals**. Built from the feature list in
`Key_Features_of_PEV.docx`.

## Stack

- **Backend:** Node.js, Express, JWT auth (`jsonwebtoken`), password hashing
  (`bcryptjs`), rate limiting (`express-rate-limit`), file uploads
  (`multer`). Data lives in a JSON file (`server/data/db.json`) — no
  external database required. Swap `server/data/store.js` for a real DB
  layer later without touching the routes.
- **Frontend:** Plain HTML/CSS/JS (no build step). Tailwind via CDN for
  utility classes; the custom design system (`public/css/*.css`) carries the
  actual visual identity. Font Awesome for icons.

## The three portals

Every account has a `role`: `client`, `company`, or `admin`, enforced on the
**backend** — a client/company token gets `403` on any `/api/admin/*`
route, and an admin token gets `403` on the client/company-only
`/api/requests` route. This is real access control, not hidden UI.

| Portal | Who | Page | What they can do |
|---|---|---|---|
| **Client** | Individual customers | `/portal-client` | Submit service requests, view project applications, book consultations, view invoices, request an official email address |
| **Company** | Business accounts | `/portal-company` | Same as client, branded with their company name |
| **Admin** | Prime Elite Ventures staff | `/admin` | Whatever their permission set allows — see "Staff rights" below |

### Staff rights are not all-or-nothing

Every staff account has a **category** (CEO, COO, CFO, Accountant, Director,
HR, Staff) and a **permissions** array — the category sets a sensible
default, but permissions can be customized per account. An Accountant does
**not** have the same rights as an HR manager or the CEO:

| Category | Default permissions |
|---|---|
| CEO / COO | Everything |
| CFO | Reports, invoices, bookings, requests |
| Accountant | Reports, invoices, bookings |
| Director | Requests, applications, content, reports, partners |
| HR | Staff accounts, applications, users, reports |
| Staff | Requests only |

This is enforced on the **backend** (`requirePermission()` middleware, not
just hidden buttons) — an HR account gets `403` calling the Site Content
API even if they somehow reached the URL directly. The admin portal UI also
hides tabs the logged-in account can't use, and lands them on the first tab
they *can* use instead of a broken "Requests" tab.

### Demo accounts

Registration (`/register`) lets the public sign up as **Individual** or
**Company**. Admin accounts are **not** self-registerable. Seven seeded demo
accounts are included so you can test every portal, role, and rights level
immediately:

| Portal | Email | Password | Category / rights |
|---|---|---|---|
| Admin | `admin@primeeliteventures.example` | `AdminPass123!` | CEO — full access |
| Admin (staff) | `d.kariuki@primeeliteventures.example` | `StaffPass123!` | Director |
| Admin (staff) | `f.nyambura@primeeliteventures.example` | `StaffPass123!` | Accountant — reports/invoices/bookings only |
| Admin (staff) | `s.otieno@primeeliteventures.example` | `StaffPass123!` | Director |
| Admin (staff) | `hr@primeeliteventures.example` | `StaffPass123!` | HR — staff/applications/users/reports only |
| Client | `client@primeeliteventures.example` | `ClientPass123!` | Individual account |
| Company | `company@primeeliteventures.example` | `CompanyPass123!` | Company name: "Acme Retail Ltd" |

Log in at `/login` with any of these — you'll be redirected to the matching
portal automatically, and (for staff) see only the tabs your rights allow.

**Change these passwords (or delete the accounts and create your own)
before deploying to production.**

## What the admin portal can do

The admin portal (`/admin`) has twelve tabs — which ones a given staff
member sees depends on their permissions (see "Staff rights" above):

1. **Requests** — every service *and* project request from every client/company, filterable by type, with status updates.
2. **Job Applications** — see every applicant, ranked by score, per job opening. Download resumes. Override any score (the ranking re-sorts live) and update hiring status.
3. **Site Content** — the CMS. Sub-tabs: **Services, Projects, Directors** (with photo upload), **Gallery** (with photo upload), **Careers, Resources** (with file upload), **Core Values**, plus three editable single-record panels: **Hero & About Copy**, **Homepage Stats**, and **Contact & Socials**. Every change appears on the public homepage immediately.
4. **Clients & Companies** — every registered account, read-only.
5. **Staff Accounts** — create/edit/remove admin logins, each with a **category**, a custom **permissions** set, a title, a bio, a photo, and a **Featured** checkbox — only featured staff appear on the public Team section. Every public team profile is tied to a real login; there's no way to list someone on the site who doesn't actually have an account.
6. **Email Requests** — review and approve/deny requests from clients, companies, or staff for an official `@primeeliteventures.example` mailbox, with an optional note.
7. **Partner Applications** — review and approve/reject applications from people or organisations interested in becoming a partner.
8. **Bookings** — every consultation booking request, confirm or cancel with one click (notifies the requester).
9. **Invoices** — create an invoice for any client or company (auto-numbered `INV-YYYY-####`), track paid/unpaid/overdue/cancelled status; the client is notified when an invoice is issued and when it's marked paid.
10. **Reports** — pick a report type (requests, applications, partners, bookings, invoices, or email requests), an optional date range, and **generate** it: a live summary (counts, status breakdowns, and — for invoices — total/paid/outstanding amounts) plus the underlying rows, with a one-click **CSV export**.
11. **Contact Messages** — every contact-form submission.
12. **Notifications** — the sent/simulated email log (see "Email notifications" below).

### Photos and files

Gallery items, Directors, and staff portraits all support real photo
uploads (JPEG/PNG/WebP/GIF, 3MB limit) — click "Upload" next to any row, or
attach one when adding a new item. Resources support PDF/Word/image
uploads (10MB limit) or a plain external link. Uploaded photos are public
(served from `/uploads/images/`); resource files are public too (from
`/uploads/files/`) since they're meant to be downloaded. Only admins with
the `content` permission can upload — a non-admin or under-permissioned
request is rejected before anything is written to disk.

## Team, Directors, Resources, Projects & Partners on the public site

- **Team** is *derived* from staff accounts marked "Featured" — it is not
  a separate, disconnected list. Add/remove someone from the public Team
  section by toggling their Featured checkbox in Staff Accounts.
- **Directors** (board members who may not have staff logins — e.g. a
  non-executive director) remain a separate CMS collection with their own
  photo upload.
- **Resources** is a public section (guides, checklists, templates) with
  three seeded examples, fully editable via the CMS.
- **Projects** is a second, parallel catalog to **Services** — packaged,
  outcome-based engagements (e.g. "Series A Readiness Sprint") that a
  client or company can apply for exactly like a service. Both funnel into
  the same request pipeline with a `type` of `service` or `project`, so
  admin sees and can filter both from one Requests tab.
- **Partners** — anyone can apply to become a partner from the homepage
  (no account needed, same pattern as a job application); admin reviews
  and approves/rejects from the Partner Applications tab.

### Applying for a Service or Project

Every Service and Project card on the homepage has an **Apply** button. If
the visitor isn't logged in, it sends them to `/login`; if they're logged
in as a client or company, it opens an inline form that submits straight
into their portal's request history — no separate page, no re-entering who
they are.

## The hero headline rotates

The homepage headline cycles through multiple messages with a fade
transition (not a single static line) — edit the list from **Hero & About
Copy** in the CMS. Each line is `Headline text | Accent word` (the accent
word is highlighted in gold); add as many as you like, one per line.

## Careers & job applications

Careers listings are publicly visible on the homepage, each with a real
**Apply** form: name, email, phone, years of experience, education level,
cover message, and a resume upload (PDF/Word, 5MB limit).

### Ranking by qualification

Each application gets an **auto-score (0–100)**, a starting suggestion:

- Education level → up to 30 points
- Years of experience → up to 30 points (caps at 7.5+ years)
- Keyword match between the cover message and the job's configured
  keywords (edited via the Careers CMS tab) → up to 40 points

Admins can **override** any applicant's score — the ranked list re-sorts
immediately. Resumes are never publicly served; downloading one requires
an authenticated admin session.

## Official email requests

Any logged-in client, company, or staff account can request an official
`@primeeliteventures.example` mailbox from their portal (a "Request an
official email address" form). The request goes to the admin's **Email
Requests** tab for approval or denial, with an optional note back to the
requester, who sees the live status update on their own portal.

## Email notifications

Whenever an admin changes a status, the affected person is emailed
automatically:

| Admin action | Who gets emailed |
|---|---|
| Change a service request's status (including **cancelled**) | The client or company who submitted it |
| Change a job application's status (including **rejected**) | The applicant, at the email they applied with |
| Approve or deny an official email request | The client/company/staff who requested it (their note is included) |

Re-submitting the same status doesn't send a duplicate email, and
overriding an applicant's score alone (without changing their status)
doesn't trigger one either — only a genuine status change does.

**Without SMTP configured** (the default), emails are not silently
dropped — they're logged to the server console and recorded in the
admin's **Notifications** tab, clearly marked "Simulated", so you can see
exactly what would have been sent and verify the logic works before wiring
up a real mail provider.

**To send real emails**, set these environment variables:

```bash
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
SMTP_SECURE=false          # true if your provider uses port 465
SMTP_FROM="Prime Elite Ventures <no-reply@primeeliteventures.example>"
```

Any SMTP provider works (SendGrid, Mailgun, Amazon SES, Postmark, Gmail
with an app password, etc.) — just point these at its SMTP credentials.

## In-app notifications

Alongside the email above, every notification also creates an **in-app
notification** for the affected client, company, or staff account —
visible immediately while they're logged in, via a bell icon in the
navbar (present on the homepage and all three portals). It shows an
unread-count badge, a dropdown of recent notifications, and lets you mark
one (or everything) as read. Polls every 30 seconds so it stays current
without a page refresh. Notifications are strictly per-user — one account
can never see or mark another account's notifications (enforced on the
backend, not just hidden in the UI).

## Bookings, Invoices & Reports

- **Bookings** — clients and companies can request a consultation slot
  (topic, preferred date/time, notes) from their portal. Staff with the
  `bookings` permission (CFO, Accountant by default) confirm or cancel
  from the admin Bookings tab; the requester is notified either way.
- **Invoices** — created entirely by staff with the `invoices` permission
  (CFO, Accountant by default) — pick a client/company, description,
  amount, currency, and due date, and an invoice number is generated
  automatically (`INV-YYYY-####`). Clients and companies can only view
  their own invoices, never create or edit one. Issuing an invoice and
  marking one paid both notify the client.
- **Reports** — generate a report on demand for any of: requests,
  applications, partner applications, bookings, invoices, or email
  requests, with an optional date range. Every report returns a live
  summary (status breakdowns; for invoices, total/paid/outstanding
  amounts) plus the underlying rows, computed fresh from current data —
  not a static or cached file — and can be exported as CSV with one click.
  Gated by the `reports` permission (CFO, Accountant, Director, HR by
  default).

## Run it

```bash
npm install
npm start
```

Visit `http://localhost:3000`.

### Before you deploy to production

The server actively **refuses to start** in production without a few
things set correctly:

- **`JWT_SECRET`** — if `NODE_ENV=production` and `JWT_SECRET` is unset (or
  still the built-in dev default), the server exits immediately. Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- **`ALLOWED_ORIGINS`** — comma-separated list of domains allowed to call
  this API cross-origin. If unset, CORS defaults to wide-open in
  development and closed to cross-origin callers in production. Your own
  website's browser requests are same-origin and unaffected either way.
- **`SMTP_*`** — without these, status-change notifications are only
  logged, never actually delivered (see "Email notifications" above).
- **Change the seed account passwords** (or delete the accounts and create
  fresh ones from the Staff Accounts tab / registration).
- **Uploaded files** (`server/uploads/resumes/`, `public/uploads/images/`,
  `public/uploads/files/`, all gitignored) need to persist across
  deploys/restarts, or swap in object storage (S3, etc.) if your hosting
  rebuilds containers from scratch.
- **Real contact info, logo, and photos** — replace the placeholder
  address/phone/email (via Contact & Socials) and add real photos for
  gallery/team/directors before launch.

## Test it

```bash
npm test
```

**197 end-to-end checks**, including everything from earlier rounds plus,
new this round:

- **Bookings**: submission, validation, role boundaries, admin confirm/cancel, and the notification that follows — confirmed a client sees their own booking and an unrelated staff account (HR, no `bookings` permission) is correctly blocked
- **Invoices**: creation with an auto-generated invoice number, validation (negative amount, invalid recipient), role boundaries, the client-side read-only view, notifications on both issue and payment, and confirmation that an Accountant (who has `invoices` but not `users`) can still reach the client list needed to pick an invoice recipient
- **Reports**: generation for every report type, correct breakdowns (including financial totals for invoices), date-range filtering (a future-dated range correctly returns zero rows), CSV export, and permission gating (HR *and* Accountant both reach Reports since both have that permission; a client cannot)
- **A real bug found and fixed by this testing**: two admin route files were mounted at the shared `/api/admin` prefix with an unscoped permission check that fired on *every* request reaching that prefix — including ones meant for entirely different routers. In practice this meant an HR account (which should be able to reach Job Applications) was silently getting `403`'d by the Site-Content router's permission check before its own request was ever evaluated. Fixed by scoping each permission check to its own specific route instead of the shared router entry point; a regression test now pins this exact scenario so it can't silently return
- **Permission system**: a new HR account is confirmed to reach `/api/admin/staff` but get `403` on Site Content; a new Accountant account is confirmed to get `403` on Staff Accounts but reach Notifications/Reports; overriding an account's permissions beyond its category default is confirmed to take effect immediately
- **Dual apply system**: a project request and a service request are each submitted, confirmed to carry the correct `type`, and confirmed filterable separately from the admin side; a new Project is created via the CMS and confirmed live on the public endpoint
- **Partner applications**: public submission (no auth), validation, role boundaries, admin approval, and the notification that follows
- **In-app notifications**: confirmed a status change creates exactly one new unread notification with the right content; confirmed one user can never mark another user's notification as read (`404`, not just hidden); confirmed mark-all-read actually zeroes the unread count
- Staff categories, the Featured flag, and confirmation that toggling it
  actually changes what's visible on the public `/api/team` endpoint live
- Image/file upload: successful upload, public fetchability with no auth,
  rejection without a token, rejection of disallowed file types, and photos
  going live on gallery/team content immediately after upload
- Resources CRUD, confirmed live on the public endpoint
- Rotating hero headlines (multi-entry `siteCopy.heroHeadlines`)
- The full official email request workflow: submit, validation, role
  boundaries (client sees only their own; a client gets `403` on the admin
  list), admin approval, and the requester seeing the updated status
- **Email notifications**: cancelling a service request, rejecting a job
  application, and approving an email request are each confirmed to
  produce exactly one correctly-worded, correctly-addressed notification —
  and re-submitting the same status, or overriding an application's score
  without changing its status, are confirmed to send *zero* notifications

All 197 currently pass. The admin, client, company, and homepage pages
were also verified by loading them into a real DOM (jsdom, dev-only, not
shipped) with their actual `<script>` tags executing against the live
server — confirming the UI genuinely renders and updates live data rather
than just checking HTTP status codes, including a live-generated Reports
table and an actually-submitted booking. This includes confirming the
admin portal actually **hides tabs** a logged-in HR or Accountant account
can't use, rather than showing a tab that silently fails.

## What's implemented (from the feature doc + follow-up requests)

| Area | Status |
|---|---|
| SEO meta, Open Graph, Twitter Card, canonical link | Done |
| Favicon (SVG + ICO + PNG), Apple touch icon, PWA icons, OG share image | Done — branded |
| PWA manifest + theme-color | Done |
| Design system, dark/light mode, dropdowns, mobile menu, language selector | Done |
| Animated hero with **rotating headlines** (CMS-editable) | Done |
| About section + Core Values (CMS-editable) | Done |
| Filterable gallery + lightbox, **with real photo uploads** | Done |
| Services / careers grids (dynamic, CMS-editable) | Done |
| **Team** derived from featured staff accounts (with portraits) | Done |
| **Directors** (separate collection, with portrait upload) | Done |
| **Resources section** (guides/checklists/templates, file upload) | Done |
| Contact form with server-side validation | Done |
| **Client portal** — service requests, project applications, bookings, invoices, official email requests | Done |
| **Company portal** — same, under a business account | Done |
| **Admin portal** — full CMS, applicant ranking, staff management, email approvals, bookings, invoices, reports, requests, users, messages | Done |
| Role-based access control (backend-enforced) | Done |
| Careers apply flow — public application form + resume upload | Done |
| Applicant ranking — auto-score + admin override | Done |
| Login/register with account-type selection | Done |
| Production hardening — JWT secret enforcement, configurable CORS, immediate session revocation | Done |
| **Multi-admin support with categories** — CEO/COO/CFO/Accountant/Director/HR/Staff, featured flag | Done |
| **Granular staff permission system** — category defaults + per-account overrides, backend-enforced, admin UI hides inaccessible tabs | Done |
| **Official email request workflow** — submit + admin approve/deny | Done |
| **Photo/file uploads** — gallery, directors, staff, resources | Done |
| **Email notifications on admin decisions** — service requests, applications, email requests | Done (logs if SMTP unset, sends for real if configured) |
| **In-app notifications** — bell icon, unread badge, mark read/all-read, per-user isolation | Done |
| **Dual apply system** — Services and Projects, both feeding one request pipeline with a `type` | Done |
| **Partner applications** — public apply form + admin approve/reject | Done |
| **Bookings** — client/company requests a consultation slot, admin confirms/cancels | Done |
| **Invoices** — admin-created, auto-numbered, client/company read-only view | Done |
| **Reports** — generate + CSV export across 6 report types, with date-range filtering | Done |

**Not implemented / follow-ups:** full multi-language translation strings
(selector wired up but only swaps the `lang` attribute), a persistent
database (JSON file is fine for a demo; swap in Postgres/MongoDB for
scale), self-service password reset, and resume text extraction (keyword
matching currently reads the cover message, not the resume file contents).

## Project layout

```
server/
  index.js               Express app entry point (CORS + JWT-secret startup checks)
  routes/
    auth.js               register / login / me (role + companyName + permissions aware)
    requests.js           client & company service/project-request CRUD (own records only, `type` field)
    admin.js               admin-only: summary, users, staff accounts (+ categories/permissions/featured), all requests, status updates, email-request approvals, notification log, messages
    adminContent.js         admin-only: CRUD for services/projects/directors/gallery/careers/resources/coreValues + settings/siteCopy/stats singletons
    adminUpload.js            admin-only: image + file upload endpoints
    applications.js            public: job application submission (multipart, resume upload)
    adminApplications.js         admin-only: ranked applications, score override, resume download, sends applicant email on status change
    emailRequests.js               authenticated: submit an official-email request, view own
    partners.js                     public: partner application submission
    adminPartners.js                 admin-only: review, approve/reject partner applications
    bookings.js                       client/company: submit + view own consultation bookings
    adminBookings.js                    admin-only: view all bookings, confirm/cancel with notification
    invoices.js                          client/company: view own invoices (read-only)
    adminInvoices.js                      admin-only: create/list/update invoices, auto-numbering, notifications
    adminReports.js                        admin-only: generate + CSV-export reports across 6 types
    notifications.js                        authenticated: own in-app notifications, mark read/all-read
    content.js                               public content: services, projects, team (derived from featured staff), directors, gallery, careers, resources, stats, settings, site-copy, core-values
    contact.js                                public contact form
  middleware/auth.js     requireAuth (re-checks user still exists + refreshes permissions every request) + requireRole(...) + requirePermission(...) — each permission check lives on its own route, never a shared router-level check, so routers sharing the `/api/admin` prefix can never block each other's requests
  utils/
    scoring.js             applicant auto-scoring logic
    permissions.js         the rights system: categories, default permission sets, sanitization
    mailer.js              sends real email via SMTP if configured, else logs + records for the admin Notifications tab
    emailTemplates.js      subject/body text for each notification type
    notify.js              fires both the in-app notification and the email for a decision
  data/                   JSON "database" (incl. 7 seeded accounts) + read/write helpers
  uploads/resumes/        uploaded resume files (private, gitignored, admin-download-only)
  test.js                 npm test — 197-check integration suite
public/
  index.html              homepage (all public sections incl. Projects, Partners, careers apply forms)
  login.html               shared login, redirects by role
  register.html             individual/company account type selector
  portal-client.html         client portal (services, projects, bookings, invoices, official email request)
  portal-company.html        company portal (+ official email request)
  admin.html                  admin portal — tabs shown are permission-filtered per staff account
  dashboard.html               legacy redirector -> correct portal by role
  css/ , js/ , manifest.json
  img/                          favicon set, PWA icons, OG share image
  uploads/images/, uploads/files/   public uploaded photos & resource files (gitignored)
```
