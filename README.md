# BFC Production Dashboard

A paid-staff companion app to **[BFC Sunday Ops](https://github.com/BFCProduction/BFC-Sunday-Ops)**.

Sunday Ops answers *"what's happening in this service/event?"* for the whole crew.
This app answers *"how do I get my non-event work done around a schedule that
moves every day?"* — for **paid production staff only**: the week's schedule,
monday.com tasks, quick links, and a shared clipboard.

**Live:** https://bfcproduction.github.io/BFC-Production-Dashboard/

## How it fits with Sunday Ops

Same stack (React + TS + Vite + Tailwind + Supabase + GitHub Pages), pointed at
the **same Supabase project and the same Planning Center OAuth app**. Because
both apps are served from `bfcproduction.github.io`, they **share the browser
session** (same localStorage key `bfc_ops_session`) — signing into one signs you
into the other.

Access to *this* app is gated by a distinct **`is_staff`** allow-list
(`dashboard_staff` table), separate from Sunday Ops' user/manager/admin tiers.
Being on the list only *adds* access to this app; it has no effect on Sunday Ops.
Volunteers never get in.

## Features

Three tabs (desktop tab row / mobile floating pill nav), plus a global quick-links row.

- **Calendar** — a real time-axis week grid (time down the left, days as columns,
  events placed by start/end), merging three live layers:
  - **PCO plan times** (emerald) — *all* plan times across 9:00, 11:00, Special
    Events, Celebrate Recovery, and BFC Students service types.
  - **Crew calendars** (blue) — each person's opt-in Google calendar (see below).
  - **monday due-dates** (orange) — tasks with a due date, shown in the all-day strip.
  - A **Calendars** button lets each user share/remove their own Google calendar.
- **Tasks** — a table that mirrors the monday "Production Tasks" board
  (Item · Person · Priority · Status · Category · Due Date), Inbox + Next Action
  groups, with monday's real column colors, profile-photo avatars, and expandable
  per-task updates. Sorted: past-due first → most-recent date → no-date last, then
  priority.
- **Clipboard** — a community shelf of up to 5 items (files, text, links) that
  auto-expire after 48h. Anyone on staff posts, everyone sees.

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS · Supabase (Postgres, Edge Functions,
Storage, pg_cron) · GitHub Pages + Actions.

## Repo layout

```
src/
  lib/         supabase client, PCO auth (shared session), is_staff check (access.ts),
               week math, links, dashboardData (all data calls)
  context/     AuthContext + staff gate
  components/  LoginScreen, TabBar, LinksRow, WeekCalendar, CalendarSettings,
               TaskList, Clipboard, HoursStrip
supabase/
  migrations/  001 tables · 002 grants · 003 calendar-link privacy · (+ MCP-applied:
               column grants, clipboard files/bucket + pg_cron prune)
  functions/   dashboard-calendar · dashboard-tasks · dashboard-hours (stub)
               _shared/ cors.ts, session.ts (requireStaff)
```

## Backend (shared Supabase project `jrvootvytlzrymwoufzu`)

**Tables (all prefixed / owned by this app):**
- `dashboard_staff` — the `is_staff` allow-list, keyed by PCO person id.
- `dashboard_calendar_links` — per-person Google iCal opt-in. The secret
  `ical_url` is **never client-readable** (base-table SELECT revoked; a public
  view `dashboard_calendar_links_public` exposes only names/active; the edge
  function reads URLs with the service role).
- `dashboard_pco_time_rules` — retained but unused (keep/skip classifier retired).
- `clipboard_items` — rolling clipboard rows; `clipboard-files` storage bucket
  holds uploaded files (public, 25MB cap).

**Edge functions** (verify the PCO session token + `is_staff` via `requireStaff`):
- `dashboard-calendar` — merges PCO (parallel fetch, all service types) + crew
  iCal + monday due-dates for a week.
- `dashboard-tasks` — Production Tasks board → typed rows with colors + avatars;
  `{action:'updates', taskId}` lazy-loads a task's updates.
- `dashboard-hours` — Phase-3 stub (returns empty).

**Scheduled:** `pg_cron` job `prune-clipboard` deletes expired `clipboard_items`
hourly. (Storage objects can't be deleted from SQL — a guard trigger blocks it —
so rolled-off files are removed client-side via the Storage API.)

**Secrets** (Supabase project, set via CLI/dashboard — never committed):
`PCO_APP_ID` / `PCO_SECRET` (a dedicated PCO Personal Access Token for plan-time
reads), `MONDAY_API_TOKEN`, `MONDAY_BOARD_ID` (= Production Tasks, `1238132367`),
`SUPABASE_SERVICE_ROLE_KEY` (auto). Reuses Sunday Ops' `pco-auth` function for login.

## Local development

```bash
npm install --legacy-peer-deps
cp .env.example .env.local   # same values as Sunday Ops' .env.local
npm run dev                  # http://localhost:5173/BFC-Production-Dashboard/
```

Frontend env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PCO_CLIENT_ID`
(all safe to expose; the anon key is not an authorization boundary).

## Deploy

Push to `main` → the `deploy.yml` GitHub Action builds and publishes to the
`gh-pages` branch → GitHub Pages serves it. Repo build secrets: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_PCO_CLIENT_ID`.

Edge functions are deployed to the shared Supabase project (via the Supabase MCP
or `supabase functions deploy <name>`).

## Operating it

- **Add a staff member:** insert their PCO person id into `dashboard_staff`. If
  someone is added but still sees "Paid crew only," their OAuth id differs from
  the Services person id — read their `users.pco_id` after they log in once and
  use that.
- **Share a calendar:** each user taps **Calendars → paste Google "secret iCal
  address" → Share**. One calendar per person; removable anytime.
- **PCO login setup:** the app's redirect URI
  (`https://bfcproduction.github.io/BFC-Production-Dashboard/` and the localhost
  equivalent) must be registered on the shared PCO OAuth application.

## Known limitations / roadmap

- **Recurring calendar events** are skipped (personal iCal layer shows one-off
  events only).
- Quick-links for the two Drive folders are placeholders — swap in real URLs in
  `src/lib/links.ts`.
- Expired *file* rows leave their storage object behind (tiny; not chased).
- **Phase 2+**: write to monday (add/check off tasks), then guard-railed PCO
  plan-time writes. `dashboard-hours` per-person workload strip is a stub.

## Security notes

- The Supabase anon key is public by design (embedded in the build); protected
  data is guarded by edge-function session checks and RLS/grants, not by the key.
- Secret Google calendar URLs are kept strictly server-side (see
  `dashboard_calendar_links` above).
- Never commit real secrets. `.env.local` is gitignored.
