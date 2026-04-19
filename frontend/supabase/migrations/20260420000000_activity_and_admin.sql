-- ============================================================
--  AURA — Complete Auth + Activity Tracking Schema
--  Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_stat_statements"; -- optional, for query analytics

-- ============================================================
--  1. ENHANCE user_profiles (add role, timestamps, preferences)
-- ============================================================
alter table public.user_profiles
  add column if not exists role text not null default 'user'
    check (role in ('user', 'admin', 'moderator')),
  add column if not exists created_at timestamp with time zone default now(),
  add column if not exists last_seen_at timestamp with time zone default now(),
  add column if not exists aqi_threshold integer default 100,
  add column if not exists notifications_enabled boolean default true,
  add column if not exists avatar_url text;

-- Index for fast role lookups
create index if not exists idx_user_profiles_role on public.user_profiles(role);
create index if not exists idx_user_profiles_last_seen on public.user_profiles(last_seen_at desc);

-- ============================================================
--  2. USER ACTIVITY LOGS — Core tracking table
-- ============================================================
create table if not exists public.user_activity_logs (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  user_email  text,                     -- denormalized for fast admin queries
  action_type text not null,            -- 'login', 'logout', 'page_visit', 'button_click', etc.
  page        text,                     -- current page/route
  metadata    jsonb default '{}'::jsonb, -- flexible extra data (city, aqi, button name, etc.)
  ip_address  text,                     -- optional, set server-side
  user_agent  text,                     -- browser/device info
  created_at  timestamp with time zone default now() not null
);

-- Indexes for performance
create index if not exists idx_activity_user_id   on public.user_activity_logs(user_id);
create index if not exists idx_activity_action    on public.user_activity_logs(action_type);
create index if not exists idx_activity_created   on public.user_activity_logs(created_at desc);
create index if not exists idx_activity_user_time on public.user_activity_logs(user_id, created_at desc);
-- GIN index for fast JSONB metadata queries
create index if not exists idx_activity_metadata  on public.user_activity_logs using gin(metadata);

-- RLS
alter table public.user_activity_logs enable row level security;

-- Users can insert their own activity
create policy "Users can log own activity"
  on public.user_activity_logs for insert
  with check (auth.uid() = user_id);

-- Users can view own activity
create policy "Users can view own activity"
  on public.user_activity_logs for select
  using (auth.uid() = user_id);

-- Admins can view ALL activity
create policy "Admins can view all activity"
  on public.user_activity_logs for select
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================================
--  3. SESSIONS TABLE (optional, tracks active sessions)
-- ============================================================
create table if not exists public.user_sessions (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  session_start timestamp with time zone default now() not null,
  session_end   timestamp with time zone,
  duration_sec  integer generated always as (
    extract(epoch from (coalesce(session_end, now()) - session_start))::integer
  ) stored,
  device_info jsonb default '{}'::jsonb
);

alter table public.user_sessions enable row level security;

create policy "Users can manage own sessions"
  on public.user_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Admins can view all sessions"
  on public.user_sessions for select
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================================
--  4. AUTO-CREATE user_profile ON SIGNUP (trigger update)
-- ============================================================
-- Update the existing trigger to also populate user_profiles
create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- Insert into profiles (existing table)
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  -- Insert into user_profiles (new table)
  insert into public.user_profiles (id, display_name, city, created_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    '',
    now()
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

-- Recreate trigger (handle_new_user already existed, just updated)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
--  5. UPDATE last_seen_at AUTOMATICALLY
-- ============================================================
create or replace function public.update_last_seen()
returns trigger as $$
begin
  update public.user_profiles
  set last_seen_at = now()
  where id = new.user_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_activity_log_insert
  after insert on public.user_activity_logs
  for each row execute procedure public.update_last_seen();

-- ============================================================
--  6. ADMIN ANALYTICS VIEW
-- ============================================================
create or replace view public.admin_activity_summary as
select
  up.id as user_id,
  up.display_name,
  up.role,
  up.city,
  up.last_seen_at,
  up.created_at as joined_at,
  au.email,
  count(al.id) as total_actions,
  count(case when al.action_type = 'login' then 1 end)      as login_count,
  count(case when al.action_type = 'page_visit' then 1 end) as page_visits,
  max(al.created_at) as last_active_at
from public.user_profiles up
join auth.users au on au.id = up.id
left join public.user_activity_logs al on al.user_id = up.id
group by up.id, up.display_name, up.role, up.city, up.last_seen_at, up.created_at, au.email;

-- ============================================================
--  7. MAKE YOURSELF AN ADMIN
--  Replace 'your-email@example.com' with the admin's email
-- ============================================================
-- update public.user_profiles
-- set role = 'admin'
-- where id = (select id from auth.users where email = 'your-email@example.com');

-- ============================================================
--  SETUP COMPLETE
--  Summary of tables:
--    public.profiles            — base profile (auto-created on signup)
--    public.user_profiles       — extended profile + role + preferences
--    public.user_activity_logs  — all user events (RLS protected)
--    public.user_sessions       — session tracking
-- ============================================================
