/**
 * AURA — Auth Store (Zustand)
 *
 * Manages authentication state, user profile, and the admin-mock bypass.
 * The admin-mock lets developers sign in without a real Supabase account
 * by using admin@aura.ai / AuraAdmin2024 — it does NOT touch the database.
 */
import { create } from 'zustand';
import { User, Session } from '@supabase/supabase-js';
import { supabase, UserProfile } from '../lib/supabase';
import { activityLogger } from '../lib/activityLogger';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  /** When true, admin mock credentials are active — no real Supabase session */
  isAdminMock: boolean;

  // Setters
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setAdminMock: (value: boolean) => void;

  // Actions
  /** Load the extended profile from user_profiles table */
  loadProfile: (userId: string) => Promise<void>;
  /** Sign out and clear all state */
  signOut: () => Promise<void>;
  /** Check if the current user has admin role */
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  // IMPORTANT: must be false by default so real auth works on load
  isAdminMock: false,

  setUser:     (user)    => set({ user }),
  setSession:  (session) => set({ session }),
  setProfile:  (profile) => set({ profile }),
  setLoading:  (isLoading) => set({ isLoading }),
  setAdminMock:(value)   => set({ isAdminMock: value }),

  loadProfile: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // Profile might not exist yet (new user before registration)
        console.warn('[AuthStore] Profile not found:', error.message);
        return;
      }
      set({ profile: data as UserProfile });
    } catch (err) {
      console.warn('[AuthStore] Failed to load profile:', err);
    }
  },

  signOut: async () => {
    const { isAdminMock } = get();
    if (!isAdminMock) {
      // Track logout before clearing session
      activityLogger.log('logout');
      await supabase.auth.signOut();
    }
    activityLogger.disable();
    set({ user: null, session: null, profile: null, isAdminMock: false });
  },

  isAdmin: () => {
    const { isAdminMock, profile } = get();
    return isAdminMock || profile?.role === 'admin';
  },
}));
