-- DUSK — leaderboard schema
-- Run this once in your Supabase project's SQL Editor (Dashboard > SQL Editor > New query).
-- Safe to re-run: uses IF NOT EXISTS / drop-and-recreate for policies.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  -- "HH:MM", 24-hour. Powers the community bedtime tracker chart, not
  -- part of the leaderboard ranking itself.
  bedtime text not null default '23:00',
  updated_at timestamptz not null default now()
);

-- Helpful for the two leaderboard sort orders.
create index if not exists profiles_current_streak_idx on public.profiles (current_streak desc);
create index if not exists profiles_longest_streak_idx on public.profiles (longest_streak desc);

alter table public.profiles enable row level security;

-- Anyone (including anonymous, not-signed-in visitors) can read the
-- leaderboard columns — that's the whole point of a public leaderboard.
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

-- A user can only ever create their own row.
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- A user can only ever update their own row (their streak numbers).
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
