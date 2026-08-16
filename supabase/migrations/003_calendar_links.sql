-- Personal crew calendar opt-in: writable by staff, but the secret iCal URL is
-- NEVER exposed to clients (the anon key is public). Clients read only a view
-- of non-secret columns; the dashboard-calendar edge function reads the URL
-- server-side with the service role.

-- One calendar per person (upsert target).
alter table dashboard_calendar_links
  add constraint dashboard_calendar_links_pco_id_key unique (pco_id);

-- Remove broad client read of the base table (it holds the secret ical_url).
drop policy if exists "read calendar links" on dashboard_calendar_links;
revoke select on dashboard_calendar_links from anon, authenticated;

-- Public projection: names + active flag only, no ical_url. Runs with the
-- view-owner's rights so clients can read it without base-table select.
create or replace view dashboard_calendar_links_public
  with (security_invoker = false) as
  select id, pco_id, person_name, color, active, created_at
  from dashboard_calendar_links;
grant select on dashboard_calendar_links_public to anon, authenticated;

-- Staff may add/replace/remove their own link (app-gated; writes need no select).
grant insert, update, delete on dashboard_calendar_links to anon, authenticated;
create policy "insert calendar link" on dashboard_calendar_links for insert with check (true);
create policy "update calendar link" on dashboard_calendar_links for update using (true) with check (true);
create policy "delete calendar link" on dashboard_calendar_links for delete using (true);
