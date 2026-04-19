/**
 * AURA — Supabase Client
 * Configured with persistent sessions, auto-refresh tokens,
 * and URL-based session detection (for OAuth redirects).
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase environment variables not set. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Keep users logged in across browser restarts
    persistSession: true,
    // Auto-refresh access tokens before they expire
    autoRefreshToken: true,
    // Detect OAuth session from URL hash on redirect
    detectSessionInUrl: true,
    // Store session in localStorage (default, explicit for clarity)
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  global: {
    headers: {
      'X-Client-App': 'AURA-AirQuality/1.0',
    },
  },
});

/** Database table types for TypeScript safety */
export type UserProfile = {
  id: string;
  display_name: string | null;
  city: string | null;
  health_sensitivities: string[] | null;
  role: 'user' | 'admin' | 'moderator';
  aqi_threshold: number;
  notifications_enabled: boolean;
  avatar_url: string | null;
  created_at: string;
  last_seen_at: string;
};

export type ActivityLog = {
  id: string;
  user_id: string;
  user_email: string | null;
  action_type: string;
  page: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};
