# Staffora Jobs — deployable app (FREE hosting)

Indeed-style Gulf manpower job board for **Staffora International**, with real
login/signup (mobile + password, and Google), saved jobs, applications, and an
admin panel. This is a standalone copy of the Staffora Jobs with Login app,
ready to deploy — it is **not** deployed yet. Nothing in this repo is live
until you follow the steps below.

## What is inside

- `server.js` — Express server + JSON API + serves the frontend. Postgres only
  (no SQLite, no in-memory DB in production).
- `public/` — the job board UI (search, country/trade filters, salary sort,
  job detail, save, apply with WhatsApp link, profile, My Applications, admin).
- `jobs.json` — seed data: **39 real jobs** fetched from the live Staffora Jobs
  app on 17 Nov 2026 — Farnek (Helper/General Labour, UAE, AED 1,050–1,350,
  100+ vacancies) + 38 Friends Test & Training Centre interview posters
  (18–29 Nov 2026). Nothing invented. Salaries/dates are exactly as posted.
- `schema.sql` — the same tables the server creates automatically (optional).
- `render.yaml` — Render Blueprint for the free web service.
- `test-local.js` — local end-to-end test harness (in-memory Postgres, test only).

## Chosen free stack — and why

**Render (free web service) + Neon (free Postgres).**

- Render free web service: 750 instance-hours/month per workspace, 512 MB RAM,
  0.1 CPU, 500 build minutes/month, 5 GB bandwidth/month. **It sleeps after
  15 minutes with no traffic and takes ~50 seconds to wake up** on the next
  visit — the first visitor after a quiet spell waits. Render's own free
  Postgres expires after **30 days**, which would delete all jobs/accounts —
  so the database is Neon instead.
- Neon free Postgres: **100 CU-hours of compute per project per month, 1 GB
  storage per project (20 GB across all projects), no credit card, no expiry**
  (per Neon's pricing/docs, checked Nov 2026 — re-check the pricing page when
  you deploy; some older pages still say 0.5 GB storage). Compute scales to
  zero after 5 minutes idle and wakes in a few hundred ms. If the 100 CU-hours
  run out, the database pauses until the next month — it does **not** delete
  your data, and writes are blocked only if storage is full.
- Why not Render Postgres / Supabase free? Render's free Postgres is deleted
  after 30 days. Supabase free gives only 500 MB storage and pauses after
  1 week of inactivity. Neon gives more storage and no expiry.
- Why not Vercel? Vercel's free tier is built for serverless functions, not a
  long-running Express server with sessions — Render fits this app as-is.
- Cost: **$0/month** on both free tiers. The one thing Render asks for: a
  **credit card is required to create a free web service** (abuse prevention —
  it does not charge you on the free plan, but without a card you cannot
  create the service). Neon needs **no card**.

## Exact deploy steps (about 20 minutes)

### 1. Put this folder on GitHub (free account)
1. Create a free GitHub account if needed, then a **new public or private
   repository** (e.g. `staffora-jobs`).
2. Upload this folder's contents to it (GitHub web upload works — no git
   needed). Do **not** upload a `.env` file; there is none in this repo.

### 2. Create the free Neon database
1. Go to https://neon.tech — sign up free (email or GitHub/Google login).
2. Create a project (any name, e.g. `staffora-jobs`), region closest to India
   (Singapore `ap-southeast-1` is usually best).
3. Open the project dashboard → **Connection Details** → copy the connection
   string. It looks like:
   `postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
   Keep the `?sslmode=require` part. Keep this string private — it is the
   database password.

### 3. Create the free Render web service
1. Go to https://render.com — sign up free (GitHub login is easiest).
2. **New → Web Service** → connect your GitHub repo → choose this repo.
   (Or: **New → Blueprint** and point it at this repo — `render.yaml` does
   the setup for you, but you still add the env vars below by hand.)
3. Settings: **Runtime: Node**, **Build Command: `npm install`**,
   **Start Command: `npm start`**, **Instance Type: Free**.
4. Environment variables (Dashboard → Environment → Add):
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | your Neon connection string from step 2 |
   | `SESSION_SECRET` | a long random string (Render can generate one) |
   | `GOOGLE_CLIENT_ID` | `277314253222-qdmo82233tmvqmvlq7vtfjuc9tc5h5o3.apps.googleusercontent.com` |
   | `ADMIN_MOBILE` | `9546450997` |
   | `ADMIN_PASSWORD` | **choose a strong password now** — this creates the admin account on first boot. After the first successful login, delete this variable from Render and redeploy. Never put it in the repo or in chat. |
   | `STAFF_CODE` | `50997` |
   | `WHATSAPP_NUMBER` | `919546450997` |
   | `NODE_ENV` | `production` |
5. Click **Deploy**. First boot takes 1–3 minutes. The server creates the
   tables, seeds the 39 jobs (only if the jobs table is empty), seeds the
   Google Client ID, and seeds the admin account from `ADMIN_PASSWORD`.
6. Your app URL will be `https://staffora-jobs.onrender.com` (or the name you
   chose). Open it — you should see the job board with 39 jobs.

### 4. Make Google login work on the new host — REQUIRED, do this last
Google only allows sign-in from origins you list. The Client ID already
exists (Google Cloud project **"Staffora Jobs"**, ID `staffora-jobs-515016`,
account **muzakkirejazanjum@gmail.com**), but it currently lists only
`https://muse.ai` and `https://www.muse.ai`.
1. Open the deployed app, log in as admin, go to **Admin → Google Login
   Setup** — the page shows the app's exact origin (e.g.
   `https://staffora-jobs.onrender.com`). Copy it.
2. Go to https://console.cloud.google.com → sign in as
   **muzakkirejazanjum@gmail.com** → project **Staffora Jobs** →
   **APIs & Services → Credentials** → OAuth client **"Staffora Jobs"**.
3. Under **Authorised JavaScript origins**, add the origin from step 1 and
   **Save**. Do **not** add a redirect URI — this app uses Google Identity
   Services, which needs only the JavaScript origin.
4. Google says settings may take **5 minutes to a few hours** to take effect.
   Mobile + password login works immediately and does not need Google at all.
   If Google sign-in shows an "origin" error after that, the origin in step 1
   is the one to check — copy it exactly, with no trailing slash.

### 5. After the first login
- Log in as admin (mobile `9546450997`, the `ADMIN_PASSWORD` you set) and
  **delete the `ADMIN_PASSWORD` variable from Render**, then redeploy.
- Post new jobs from Admin → Post a New Job. Old interview jobs (18–29 Nov
  2026) can be closed from Admin → All Jobs when their interview date passes.

## Env vars (summary)

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `SESSION_SECRET` | Yes (production) | Long random string for login sessions |
| `GOOGLE_CLIENT_ID` | No (defaults to the existing one) | Google OAuth Client ID |
| `ADMIN_PASSWORD` | Only on first boot | Seeds the admin account; delete after first login |
| `ADMIN_MOBILE` | No (default `9546450997`) | Admin account mobile |
| `STAFF_CODE` | No (default `50997`) | Code required to sign up as admin |
| `WHATSAPP_NUMBER` | No (default `919546450997`) | Number in the WhatsApp apply link |
| `PORT` | No (Render sets it) | Port the server listens on |
| `NODE_ENV` | No (set `production` on Render) | Enables secure cookies |

## Free-tier limits and expiry risks (read before you rely on this)

- **Render free web service sleeps after 15 minutes idle; first visit after
  that waits ~50 seconds.** Candidates may think the site is broken. Fix
  later (paid Starter, ~$7/month) if this becomes a problem — do not use a
  free "keep-alive pinger": Render blocks traffic from popular free ping
  services.
- **Render free = 750 instance-hours/month per workspace.** One service
  running all month uses ~744 hours, so one app fits. A second free service
  in the same workspace would exceed it and both would be suspended until
  next month.
- **Render requires a credit card for free web services.** No charge on the
  free plan, but no card = no service.
- **Neon free = 100 CU-hours/month per project.** A quiet job board uses far
  less (compute sleeps after 5 minutes idle). If it runs out, the database
  pauses until next month — data is **not** deleted.
- **Neon free storage = 1 GB per project.** This app's data (39 jobs, users,
  applications) is a few MB. No risk at this size.
- **Do not use Render's free Postgres** — it is deleted after 30 days.
- **Backups:** Neon free keeps only a 6-hour restore window. Export the jobs
  list from the app regularly if the data matters — there is no automatic
  backup on the free tier.

## Local test (what was verified here)

On this machine there is no local Postgres and no sudo, so the test harness
runs the server against an in-memory Postgres (`pg-mem`, dev-only,
`DATABASE_URL=memory`):

```bash
npm install
npm test        # runs test-local.js — homepage + jobs API + signup/login/save/apply/admin/Google-config
```

`npm start` with a real `DATABASE_URL` uses real Postgres (`pg`); the
`memory` mode is never used when `DATABASE_URL` is a real connection string.
Google sign-in end-to-end cannot be tested locally — it needs the deployed
origin registered in Google Cloud (step 4) and a real Google account; the
local test verifies that a fake Google token is rejected (401) and that the
config endpoint returns the Client ID.

## Troubleshooting

- **"DATABASE_URL env var is required"** — the variable is missing in Render
  → add it in Dashboard → Environment and redeploy.
- **App shows 0 jobs** — the seed runs only when the jobs table is empty. If
  the table was created empty by a failed first boot, delete the rows or the
  database and redeploy (or re-run with a fresh Neon database).
- **Login does not stick / logged out on refresh** — `SESSION_SECRET` changed
  between deploys (Render regenerated it?) or cookies are blocked. Set a
  fixed `SESSION_SECRET` and redeploy.
- **Google button does nothing / "origin" error** — the deployed origin is
  not in Google Cloud yet (step 4), or Google's change has not taken effect
  yet (wait up to a few hours).
- **First page load is slow (~50s)** — normal on Render free: the service
  was asleep. Refresh once and it loads fast.
