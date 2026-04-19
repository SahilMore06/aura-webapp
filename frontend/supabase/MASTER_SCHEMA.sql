-- ============================================================
--  AURA AIR QUALITY PLATFORM — COMPLETE DATABASE SCHEMA
--  v1.0 | Run this in ANY new Supabase project to get started.
--
--  Instructions:
--    1. Go to supabase.com → New Project
--    2. SQL Editor → New Query
--    3. Paste this ENTIRE file → Run
--
--  This creates ALL tables, triggers, RLS policies, indexes,
--  and views needed for the AURA platform.
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ============================================================
--  TABLE 1: profiles
--  Auto-created on signup via trigger. Base identity table.
-- ============================================================
create table if not exists public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  full_name   text,
  avatar_url  text,
  theme       text default 'system',
  alerts_enabled  boolean default false,
  aqi_threshold   integer default 100,
  created_at  timestamp with time zone default now() not null,
  updated_at  timestamp with time zone default now() not null
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"   on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- ============================================================
--  TABLE 2: user_profiles
--  Extended profile with role, city, health settings.
-- ============================================================
create table if not exists public.user_profiles (
  id                      uuid references auth.users(id) on delete cascade primary key,
  display_name            text,
  city                    text default '',
  health_sensitivities    text[] default '{}',
  role                    text not null default 'user'
                            check (role in ('user', 'admin', 'moderator')),
  aqi_threshold           integer default 100,
  notifications_enabled   boolean default true,
  avatar_url              text,
  created_at              timestamp with time zone default now(),
  updated_at              timestamp with time zone default now(),
  last_seen_at            timestamp with time zone default now()
);

create index if not exists idx_user_profiles_role     on public.user_profiles(role);
create index if not exists idx_user_profiles_last_seen on public.user_profiles(last_seen_at desc);

alter table public.user_profiles enable row level security;

create policy "Users can view own user_profile"   on public.user_profiles for select using (auth.uid() = id);
create policy "Users can update own user_profile" on public.user_profiles for update using (auth.uid() = id);
create policy "Users can insert own user_profile" on public.user_profiles for insert with check (auth.uid() = id);

-- ============================================================
--  TABLE 3: stations  (AQI monitoring station metadata)
-- ============================================================
create table if not exists public.stations (
  id            uuid default uuid_generate_v4() primary key,
  name          text not null,
  latitude      double precision not null,
  longitude     double precision not null,
  location_type text default 'urban',
  status        text default 'active',
  created_at    timestamp with time zone default now() not null
);

alter table public.stations enable row level security;
create policy "Anyone can view active stations" on public.stations for select using (status = 'active');

-- ============================================================
--  TABLE 4: readings  (Live AQI readings from stations)
-- ============================================================
create table if not exists public.readings (
  id          uuid default uuid_generate_v4() primary key,
  station_id  uuid references public.stations(id) on delete cascade not null,
  aqi         integer not null,
  pm25        numeric not null,
  pm10        numeric not null,
  o3          numeric,
  no2         numeric,
  so2         numeric,
  co          numeric,
  temperature numeric,
  humidity    numeric,
  timestamp   timestamp with time zone default now() not null
);

alter table public.readings enable row level security;
create policy "Anyone can view readings" on public.readings for select using (true);

-- ============================================================
--  TABLE 5: user_activity_logs  (All tracked user events)
-- ============================================================
create table if not exists public.user_activity_logs (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  user_email  text,
  action_type text not null,
  page        text,
  metadata    jsonb default '{}'::jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamp with time zone default now() not null
);

create index if not exists idx_activity_user_id   on public.user_activity_logs(user_id);
create index if not exists idx_activity_action    on public.user_activity_logs(action_type);
create index if not exists idx_activity_created   on public.user_activity_logs(created_at desc);
create index if not exists idx_activity_user_time on public.user_activity_logs(user_id, created_at desc);
create index if not exists idx_activity_metadata  on public.user_activity_logs using gin(metadata);

alter table public.user_activity_logs enable row level security;

create policy "Users can log own activity"    on public.user_activity_logs for insert with check (auth.uid() = user_id);
create policy "Users can view own activity"   on public.user_activity_logs for select using (auth.uid() = user_id);
create policy "Admins can view all activity"  on public.user_activity_logs for select
  using (exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
--  TABLE 6: user_sessions
-- ============================================================
create table if not exists public.user_sessions (
  id            uuid default uuid_generate_v4() primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  session_start timestamp with time zone default now() not null,
  session_end   timestamp with time zone,
  duration_sec  integer generated always as (
    extract(epoch from (coalesce(session_end, now()) - session_start))::integer
  ) stored,
  device_info   jsonb default '{}'::jsonb
);

alter table public.user_sessions enable row level security;

create policy "Users can manage own sessions" on public.user_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Admins can view all sessions"  on public.user_sessions for select
  using (exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin'));

-- ============================================================
--  TABLE 7: otp_verifications
-- ============================================================
create table if not exists public.otp_verifications (
  id            uuid default uuid_generate_v4() primary key,
  user_id       uuid references auth.users(id) on delete cascade,
  email         text not null,
  otp_hash      text not null,
  purpose       text not null check (purpose in ('signup_verify', 'login_2fa', 'password_reset')),
  expires_at    timestamp with time zone not null,
  is_verified   boolean default false,
  attempt_count integer default 0,
  created_at    timestamp with time zone default now() not null
);

create index if not exists idx_otp_email_purpose on public.otp_verifications(email, purpose);
create index if not exists idx_otp_expires        on public.otp_verifications(expires_at);

alter table public.otp_verifications enable row level security;
-- OTP table accessed only via backend with service role key (no client policies needed)

-- ============================================================
--  TRIGGER: Auto-create profiles on user signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
--  TRIGGER: Update last_seen_at when activity is logged
-- ============================================================
create or replace function public.update_last_seen()
returns trigger as $$
begin
  update public.user_profiles set last_seen_at = now() where id = new.user_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_activity_log_insert
  after insert on public.user_activity_logs
  for each row execute procedure public.update_last_seen();

-- ============================================================
--  CLEANUP FUNCTION: Delete expired OTPs (run hourly manually
--  or schedule with pg_cron if available)
-- ============================================================
create or replace function public.cleanup_expired_otps()
returns void as $$
begin
  delete from public.otp_verifications where expires_at < now() - interval '1 hour';
end;
$$ language plpgsql security definer;

-- ============================================================
--  VIEW: admin_activity_summary (used by /admin dashboard)
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
  count(al.id)                                                    as total_actions,
  count(case when al.action_type = 'login'      then 1 end)      as login_count,
  count(case when al.action_type = 'page_visit' then 1 end)      as page_visits,
  max(al.created_at)                                             as last_active_at
from public.user_profiles up
join auth.users au on au.id = up.id
left join public.user_activity_logs al on al.user_id = up.id
group by up.id, up.display_name, up.role, up.city, up.last_seen_at, up.created_at, au.email;

-- ============================================================
--  SEED: Demo monitoring stations (optional)
-- ============================================================
insert into public.stations (id, name, latitude, longitude, location_type) values
  ('550e8400-e29b-41d4-a716-446655440000', 'Downtown Seattle (Pioneer Square)', 47.602, -122.332, 'urban'),
  ('550e8400-e29b-41d4-a716-446655440001', 'Bellevue (Downtown Park)',         47.611, -122.204, 'suburban'),
  ('550e8400-e29b-41d4-a716-446655440002', 'Redmond (Marymoor Park)',          47.662, -122.115, 'suburban'),
  ('550e8400-e29b-41d4-a716-446655440003', 'Renton (The Landing)',             47.498, -122.203, 'urban')
on conflict (id) do nothing;

-- ============================================================
--  MAKE YOURSELF AN ADMIN
--  After signing up, run this with YOUR email:
-- ============================================================
-- update public.user_profiles
-- set role = 'admin'
-- where id = (select id from auth.users where email = 'your@email.com');

-- ============================================================
--  DONE ✅
--  Tables created:
--    profiles, user_profiles, stations, readings,
--    user_activity_logs, user_sessions, otp_verifications
--  Triggers: on_auth_user_created, on_activity_log_insert
--  View: admin_activity_summary
-- ============================================================
