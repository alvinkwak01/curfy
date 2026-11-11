-- Clients read the public leaderboard; only signed-in (including anonymous
-- Auth) identities upsert their own profile under existing RLS.
-- Account removal remains server-side with auth.users ON DELETE CASCADE.
-- No data, RLS policy, service_role grant, or schema default is changed.
revoke insert, update, delete, truncate, references, trigger on table public.profiles from anon;
revoke delete, truncate, references, trigger on table public.profiles from authenticated;
