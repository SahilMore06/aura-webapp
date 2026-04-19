/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { Landing } from './pages/Landing';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { MapView } from './pages/Map';
import { Analytics } from './pages/Analytics';
import { Settings } from './pages/Settings';
import { Registration } from './pages/Registration';
import { Admin } from './pages/Admin';
import { OTPVerification } from './pages/OTPVerification';
import { IosDockBar } from './components/dock/IosDockBar';
import { supabase } from './lib/supabase';
import { useAuthStore } from './store/authStore';
import { activityLogger } from './lib/activityLogger';

// ── Protected Route ────────────────────────────────────────────
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading, isAdminMock } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-stroke border-t-[#00D4AA] animate-spin" />
      </div>
    );
  }

  if (!session && !isAdminMock) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// ── Admin-only Route ───────────────────────────────────────────
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdminMock, profile } = useAuthStore();
  const isAdmin = isAdminMock || profile?.role === 'admin';

  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

// ── Page tracker (auto-logs route changes) ─────────────────────
function PageTracker() {
  const location = useLocation();
  const { session, isAdminMock } = useAuthStore();

  useEffect(() => {
    // Don't track for admin mock or unauthenticated users
    if (isAdminMock || !session?.user) return;
    // Don't track auth pages
    if (['/auth', '/'].includes(location.pathname)) return;

    activityLogger.log('page_visit', {
      page: location.pathname,
      metadata: { pathname: location.pathname },
    });
  }, [location.pathname, session?.user?.id, isAdminMock]);

  return null;
}

// ── Animated Routes ────────────────────────────────────────────
function AnimatedRoutes() {
  const location = useLocation();
  const isLandingOrAuth = location.pathname === '/' || location.pathname === '/auth';

  return (
    <>
      <PageTracker />
      <AnimatePresence mode="wait">
        {/* @ts-ignore */}
        <Routes location={location} key={location.pathname}>
          <Route path="/"             element={<Landing />} />
          <Route path="/auth"         element={<Auth />} />
          <Route path="/verify-otp"    element={<ProtectedRoute><OTPVerification /></ProtectedRoute>} />
          <Route path="/registration" element={<ProtectedRoute><Registration /></ProtectedRoute>} />
          <Route path="/dashboard"    element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/map"          element={<ProtectedRoute><MapView /></ProtectedRoute>} />
          <Route path="/analytics"    element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          <Route path="/settings"     element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/admin"        element={<ProtectedRoute><AdminRoute><Admin /></AdminRoute></ProtectedRoute>} />
        </Routes>
      </AnimatePresence>

      {!isLandingOrAuth && <IosDockBar />}
    </>
  );
}

// ── Auth Provider ──────────────────────────────────────────────
function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setSession, setUser, setLoading, isAdminMock, loadProfile } = useAuthStore();

  useEffect(() => {
    // Get initial session (handles page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isAdminMock) {
        setSession(session);
        setUser(session?.user ?? null);
        // Load extended profile if session exists
        if (session?.user?.id) {
          loadProfile(session.user.id);
        }
      }
      setLoading(false);
    });

    // Subscribe to auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!useAuthStore.getState().isAdminMock) {
        setSession(session);
        setUser(session?.user ?? null);
        // Reload profile on every auth state change
        if (session?.user?.id) {
          loadProfile(session.user.id);
        }
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}

// ── App Root ───────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AnimatedRoutes />
      </Router>
    </AuthProvider>
  );
}
