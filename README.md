# BFC Production Dashboard

A paid-staff companion app to **BFC Sunday Ops**. Sunday Ops answers *"what's
happening in this service/event?"* for the whole crew. This app answers *"how do
I get my non-event work done around a schedule that moves every day?"* for **paid
production staff only** — this week's merged schedule, monday.com tasks, quick
links, and a shared clipboard.

Full product context lives in the vault note **`300 - Projects/BFC Production Dashboard.md`**.

## Design in one paragraph

Same stack as Sunday Ops (React + TS + Vite + Tailwind + Supabase + GitHub Pages),
pointed at the **same Supabase project and same Planning Center OAuth app**.
Because both apps are served from `bfcproduction.github.io`, they **share
localStorage** — signing into Sunday Ops signs you into this app too. Access to
*this* app is gated by a distinct **`is_staff`** allow-list (`dashboard_staff`
table) that has **no effect on Sunday Ops permissions**. Volunteers never get in.

## Status: Phase 1 scaffold (not yet deployed)

Built and committed locally. **Nothing has been applied to the live Supabase
project, no repo has been pushed, and no PCO redirect URI has been registered** —
those are the human-in-the-loop steps below.

Frontend is complete for Phase 1: PCO login + staff gate, week calendar,
monday task list with expandable updates, links row, community clipboard, and an
hours strip. The UI shows honest empty states until the edge functions are
deployed.

## What only Alan can do (the gaps)

1. **Register the redirect URI** in the PCO developer app:
   `https://bfcproduction.github.io/BFC-Production-Dashboard/`
   (and `http://localhost:5173/BFC-Production-Dashboard/` for local dev).
2. **Create the GitHub repo** `BFCProduction/BFC-Production-Dashboard`, push, and
   enable **Pages** (branch `gh-pages`) + Actions. Add repo secrets
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PCO_CLIENT_ID`.
3. **Apply the migration** `supabase/migrations/001_dashboard_foundation.sql` to
   the shared project (review first — it is additive, own tables only).
4. **Deploy the edge functions** to the shared project:
   `supabase functions deploy dashboard-calendar dashboard-tasks dashboard-hours`.
   They reuse existing project secrets (`PCO_APP_ID/PCO_SECRET`, `MONDAY_API_TOKEN`,
   `MONDAY_BOARD_ID`, `SUPABASE_SERVICE_KEY`); add any that are missing.
5. **Create the `clipboard-files` storage bucket** (public) with read/insert/delete
   policies scoped to that bucket.
6. **Seed staff**: insert paid crew `pco_id`s into `dashboard_staff`.
7. **Personal calendars**: crew who opt in add a Google iCal share URL row to
   `dashboard_calendar_links` (a simple opt-in form/how-to comes later).

## Local dev

```bash
npm install --legacy-peer-deps
cp .env.example .env.local   # fill in the same values Sunday Ops uses
npm run dev                  # http://localhost:5173/BFC-Production-Dashboard/
```

## Layout

```
src/
  lib/         supabase client, PCO auth (shared session), is_staff check,
               PCO time classifier, week math, links, data calls
  context/     AuthContext + staff gate
  components/  LoginScreen, LinksRow, WeekCalendar, TaskList, Clipboard, HoursStrip
supabase/
  migrations/  001_dashboard_foundation.sql   (additive; own tables)
  functions/   dashboard-calendar | dashboard-tasks | dashboard-hours (Phase 3 stub)
```

## Open questions (from the project note)

- Confirm the monday board/group IDs and the people/status column IDs (avatars,
  status colors) — `dashboard-tasks` has TODOs where those plug in.
- Real Drive folder URLs for "00 Prod Docs This Week" and "05 Events" in `src/lib/links.ts`.
- Where the `is_staff` toggle lives long-term (likely Sunday Ops People & Access).
