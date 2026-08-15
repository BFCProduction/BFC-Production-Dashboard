-- Table privileges for the dashboard tables. Migration 001 set up RLS + policies
-- but not the underlying GRANTs, so even the service role hit
-- "permission denied for table dashboard_staff". These grants fix that.
--
-- anon/authenticated are the client roles (gated further by RLS policies);
-- service_role is used by the edge functions (bypasses RLS but still needs the
-- table grant).

grant select on dashboard_staff            to anon, authenticated, service_role;
grant select on dashboard_calendar_links   to anon, authenticated, service_role;
grant select on dashboard_pco_time_rules   to anon, authenticated, service_role;
grant select, insert, delete on clipboard_items to anon, authenticated, service_role;
