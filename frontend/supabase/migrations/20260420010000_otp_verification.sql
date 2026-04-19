-- ============================================================
--  AURA — OTP Verification Table
--  Run in Supabase SQL Editor after the previous migration
-- ============================================================

-- OTP Verifications table
create table if not exists public.otp_verifications (
  id             uuid default uuid_generate_v4() primary key,
  user_id        uuid references auth.users(id) on delete cascade,
  email          text not null,
  otp_hash       text not null,          -- bcrypt hash of the 6-digit OTP
  purpose        text not null           -- 'signup_verify' | 'login_2fa' | 'password_reset'
    check (purpose in ('signup_verify', 'login_2fa', 'password_reset')),
  expires_at     timestamp with time zone not null,
  is_verified    boolean default false,
  attempt_count  integer default 0,      -- brute-force guard: max 5 attempts
  created_at     timestamp with time zone default now() not null
);

-- Fast lookups by email+purpose (used in verify flow)
create index if not exists idx_otp_email_purpose
  on public.otp_verifications(email, purpose);

-- Fast lookups for cleanup
create index if not exists idx_otp_expires
  on public.otp_verifications(expires_at);

-- RLS
alter table public.otp_verifications enable row level security;

-- Only the backend (service role key) can read/write this table.
-- No direct client access allowed — everything goes through the Flask API.
-- (No user-facing policies needed)

-- ── Auto-Cleanup Function (runs via pg_cron or manually) ──────────────────
create or replace function public.cleanup_expired_otps()
returns void as $$
begin
  delete from public.otp_verifications
  where expires_at < now() - interval '1 hour';
end;
$$ language plpgsql security definer;

-- ── Optional: Schedule cleanup every hour via pg_cron ─────────────────────
-- Uncomment if pg_cron extension is available in your Supabase plan:
-- select cron.schedule('cleanup-otps', '0 * * * *', 'select public.cleanup_expired_otps()');

-- ============================================================
--  DONE — Table 'public.otp_verifications' created
-- ============================================================
