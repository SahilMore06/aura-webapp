-- AURA Platform — Full Schema for New Supabase Project
-- Run this entire file in: supabase.com/dashboard/project/igysgcpgxaejrfyzqbhe/sql/new

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name          TEXT,
  city                  TEXT,
  health_sensitivities  TEXT[] DEFAULT '{}',
  role                  TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
  aqi_threshold         INTEGER NOT NULL DEFAULT 100 CHECK (aqi_threshold BETWEEN 0 AND 500),
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  avatar_url            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.otp_verifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  otp_hash      TEXT NOT NULL,
  purpose       TEXT NOT NULL CHECK (purpose IN ('signup_verify', 'login_2fa', 'password_reset')),
  expires_at    TIMESTAMPTZ NOT NULL,
  is_verified   BOOLEAN NOT NULL DEFAULT false,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email  TEXT,
  action_type TEXT NOT NULL,
  page        TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON public.otp_verifications(email, purpose, is_verified);
CREATE INDEX IF NOT EXISTS idx_otp_email_created ON public.otp_verifications(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON public.otp_verifications(expires_at);
CREATE INDEX IF NOT EXISTS idx_activity_user ON public.user_activity_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON public.user_activity_logs(action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_city ON public.user_profiles(city);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, created_at, last_seen_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.otp_verifications WHERE expires_at < NOW() - INTERVAL '1 hour';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER cleanup_otps_on_insert
  AFTER INSERT ON public.otp_verifications
  FOR EACH STATEMENT EXECUTE FUNCTION public.cleanup_expired_otps();

ALTER TABLE public.user_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_verifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_logs  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile"    ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile"  ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile"  ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles"  ON public.user_profiles;
DROP POLICY IF EXISTS "No direct client access to OTPs" ON public.otp_verifications;
DROP POLICY IF EXISTS "Users can insert own logs"     ON public.user_activity_logs;
DROP POLICY IF EXISTS "Users can view own logs"       ON public.user_activity_logs;
DROP POLICY IF EXISTS "Admins can view all logs"      ON public.user_activity_logs;

CREATE POLICY "Users can view own profile"
  ON public.user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can view all profiles"
  ON public.user_profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "No direct client access to OTPs"
  ON public.otp_verifications FOR ALL USING (false);

CREATE POLICY "Users can insert own logs"
  ON public.user_activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own logs"
  ON public.user_activity_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all logs"
  ON public.user_activity_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
