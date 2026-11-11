-- Postgres 17 MAINTAIN is separate from the legacy information_schema grant inventory.
revoke maintain on table public.profiles from anon, authenticated;
