# Ledgerly — Expense management, beautifully simple

A complete, production-quality expense-tracking web app + marketing site, built
as a fast, private, installable Progressive Web App with **zero runtime
dependencies** (no frameworks, no CDN calls — works fully offline).

**Live:** once GitHub Pages deploys, this lives at
`https://dpatel15.github.io/`

- Marketing / pricing site → `index.html` (site root)
- The app → `app/`

---

## Features

### Money tracking
- Add **expenses and income** with amount, date, category, vendor/merchant,
  payment method, account, tags, notes and a **receipt photo** (auto-compressed,
  stored privately on-device).
- **Multi-currency** — record in 15+ currencies, everything normalized to a base
  currency.
- **Recurring transactions** (rent, subscriptions, payroll) post automatically
  when due.
- Customizable **categories** (icons, colors, tax-deductible flag) and
  **accounts/wallets** with running balances.

### Insight
- **Dashboard** with animated, hand-built SVG charts: spending trend (area),
  income vs. expenses (bars), category breakdown (donut) — plus
  period-over-period deltas.
- **Budgets** per category with progress bars and over-budget alerts.
- **Reports** with date-range filters, category & vendor breakdowns, a
  **tax/deductible report**, CSV export and print-to-PDF.

### Product / SaaS
- **Accounts & multiple workspaces** (multi-tenant) — run several businesses
  side by side, each isolated.
- Email/password **auth** (hashed) with session restore, plus a one-click live
  **demo** account.
- **Landing + pricing page** (Starter / Pro / Business, monthly & annual) with a
  simulated checkout flow that's ready to wire to Stripe.
- **Dark mode**, fully **responsive**, **PWA** (installable, offline).
- **Backup & restore** (JSON) and **CSV import**.

### Subscriptions, billing & plans
- **Three plans** — Starter (free), Pro, Business — monthly & annual pricing
  (`assets/js/billing.js`).
- **14-day Pro free trial** on every signup; converts to paid or drops to
  Starter at trial end.
- **Entitlements & feature gating** — plans grant features (recurring, budgets,
  tax reports, multi-currency, multiple workspaces, team) and enforce limits
  (workspaces, seats). Locked features show an in-app **paywall**.
- **In-app Billing page** — trial/status banner, usage meters, upgrade /
  downgrade, cancel / resume, saved **payment methods**, and **billing history**
  with downloadable invoice receipts.
- **Mock payment processor** — Luhn-validates cards, test cards (`4242…`
  succeeds, `4000…0002` declines), issues invoices. Single drop-in point for
  **Stripe** later.
- **Team & seats** (Business) — invite members with roles; seat limits enforced.

### Super Admin console  (`/admin/`)
Role-gated platform console (log in as a `superadmin`):
- **Overview** — MRR, ARR, net revenue, paying customers, trials, plan-mix donut,
  revenue chart, recent signups.
- **Users** — search, change plan (comp/grant), extend trial, suspend, delete,
  and **impersonate** (view the app as any user).
- **Subscriptions**, **Revenue** (invoices, refunds, CSV export),
  **Plans** (edit pricing/limits/features live), and an **Audit log**.

A demo super-admin (`admin@ledgerly.app` / `admin1234`) is auto-provisioned on
first visit to `/admin/`.

---

## Architecture

Plain HTML/CSS/vanilla JS. Data persists in **IndexedDB** (durable, handles
receipt images). No build step.

```
.
├─ index.html                 Marketing + pricing site
├─ manifest.webmanifest       PWA manifest
├─ sw.js                      Service worker (offline app shell)
├─ app/
│  └─ index.html              App shell
├─ admin/
│  └─ index.html              Super Admin console shell
├─ assets/
│  ├─ css/
│  │  ├─ app.css              App design system (light/dark)
│  │  ├─ landing.css          Marketing site styles
│  │  └─ admin.css            Admin console theme
│  └─ js/
│     ├─ util.js              Helpers: currency, dates, DOM, CSV, hashing
│     ├─ db.js                Promise-based IndexedDB wrapper
│     ├─ store.js             Domain layer: auth, workspaces, CRUD, analytics, admin
│     ├─ billing.js           Plans, entitlements, payment processor, invoices
│     ├─ charts.js            Dependency-free SVG charts
│     ├─ modals.js            Transaction / category / budget editors
│     ├─ views.js             Screen renderers (incl. billing & team)
│     ├─ app.js               Bootstrap, auth gate, hash router, feature gating
│     └─ admin.js             Super Admin console
└─ icons/                     App icons (SVG + PNG)
```

### Privacy
All financial data lives locally in the browser (IndexedDB). Nothing is sent to
a server. Users export a JSON backup to move between devices.

### Going to real SaaS
The code is structured to swap the local store for a backend: `store.js` is the
single data layer, and the checkout flow in `index.html` is a drop-in point for
Stripe Checkout. Wire those two and add a sync API to run it as hosted SaaS.

## Develop locally
Serve the folder over HTTP (service worker + IndexedDB need `http(s)`):

```bash
npx serve .        # then open http://localhost:3000/
```
