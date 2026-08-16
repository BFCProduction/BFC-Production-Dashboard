-- Calendar links: multiple per person + a working delete path.
-- (Applied to the shared project via the Supabase MCP; recorded here for history.)

-- Multiple calendars per person, each optionally labeled.
alter table dashboard_calendar_links drop constraint if exists dashboard_calendar_links_pco_id_key;
alter table dashboard_calendar_links add column if not exists label text;

-- Public projection includes label; ical_url still omitted.
drop view if exists dashboard_calendar_links_public;
create view dashboard_calendar_links_public
  with (security_invoker = false) as
  select id, pco_id, person_name, label, color, active, created_at
  from dashboard_calendar_links;
grant select on dashboard_calendar_links_public to anon, authenticated;

-- Column-level SELECT on everything EXCEPT ical_url. Enables filtered
-- UPDATE/DELETE (WHERE id=…) and upserts without exposing the secret URL.
grant select (id, pco_id, person_name, label, color, active, created_at)
  on dashboard_calendar_links to anon, authenticated;

-- Row-visibility SELECT policy so RLS lets filtered DELETE/UPDATE find rows.
-- ical_url stays hidden by the column GRANT above, NOT by RLS — so a permissive
-- row policy here is safe. Without this policy, DELETE returned 204 but removed
-- nothing (RLS hid the target row).
drop policy if exists "read calendar links" on dashboard_calendar_links;
create policy "read calendar links" on dashboard_calendar_links for select using (true);
