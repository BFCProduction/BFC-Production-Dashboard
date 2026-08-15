-- ─────────────────────────────────────────────────────────────────────────────
-- BFC Production Dashboard — foundation
--
-- Runs against the SAME Supabase project as Sunday Ops. Everything here is
-- NEW and additive (own tables, own prefix) — it does not touch any Sunday Ops
-- table. Reviewed by Alan before apply.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Staff gate ---------------------------------------------------------------
-- The `is_staff` allow-list for THIS app. Keyed by PCO id (what the session
-- carries). Separate from Sunday Ops user/manager/admin tiers on purpose.
create table if not exists dashboard_staff (
  pco_id      text primary key,
  name        text,
  added_by    text,
  created_at  timestamptz not null default now()
);

alter table dashboard_staff enable row level security;

-- Anyone signed in may READ the list (the app checks their own membership).
create policy "read staff list" on dashboard_staff
  for select using (true);
-- Writes are service-role only (managed via an admin path / SQL), so no
-- insert/update/delete policy is granted to anon/authenticated.

-- 2) Personal calendar opt-in -------------------------------------------------
-- Each crew member who opts in stores a Google calendar share URL (public
-- iCal or secret address). Read server-side by the dashboard-calendar function.
create table if not exists dashboard_calendar_links (
  id           uuid primary key default gen_random_uuid(),
  pco_id       text not null,
  person_name  text not null,
  ical_url     text not null,
  color        text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table dashboard_calendar_links enable row level security;
create policy "read calendar links" on dashboard_calendar_links
  for select using (true);

-- 3) PCO time classifier overrides -------------------------------------------
-- The editable keep/skip list. Seeded defaults live in code (pcoClassifier.ts);
-- this table lets Alan reclassify a time name without a deploy. Unlisted names
-- fall back to code defaults, then to "unknown" (show-until-filed).
create table if not exists dashboard_pco_time_rules (
  name_pattern text primary key,   -- lower-cased substring match
  disposition  text not null check (disposition in ('keep','skip')),
  updated_by   text,
  updated_at   timestamptz not null default now()
);

alter table dashboard_pco_time_rules enable row level security;
create policy "read time rules" on dashboard_pco_time_rules
  for select using (true);

-- 4) Community clipboard ------------------------------------------------------
-- Rolling shelf of up to 5 items, auto-expiring after 48h. Files live in the
-- `clipboard-files` storage bucket; text/links live inline.
create table if not exists clipboard_items (
  id                    uuid primary key default gen_random_uuid(),
  kind                  text not null check (kind in ('file','text','link')),
  label                 text not null,
  body                  text,          -- text content, or URL for links
  file_url              text,          -- public/signed URL for files
  file_name             text,
  posted_by_name        text not null,
  posted_by_avatar_url  text,
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null
);

create index if not exists clipboard_items_expires_idx on clipboard_items (expires_at);

alter table clipboard_items enable row level security;
-- Staff-gated app; Phase 1 keeps policies permissive for signed-in use and
-- relies on the app gate. Tighten to a verified staff check in a later phase.
create policy "read clipboard"   on clipboard_items for select using (true);
create policy "insert clipboard" on clipboard_items for insert with check (true);
create policy "delete clipboard" on clipboard_items for delete using (true);

-- Storage bucket for clipboard files (create in dashboard or via CLI):
--   insert into storage.buckets (id, name, public) values ('clipboard-files','clipboard-files', true);
-- plus public read/insert/delete policies scoped to bucket_id = 'clipboard-files'.

-- 5) Scheduled prune ----------------------------------------------------------
-- A pg_cron job (or a GitHub Action) should delete expired rows hourly:
--   delete from clipboard_items where expires_at < now();
