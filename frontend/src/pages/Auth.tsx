/**
 * AURA — Auth Page
 * Handles: Sign In, Sign Up, Forgot Password, Google OAuth, GitHub OAuth
 * All errors are mapped to human-readable messages.
 * Activity tracking fires on login/signup success.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Github, Chrome, AlertCircle, Eye, EyeOff, ArrowLeft, User, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { activityLogger } from '../lib/activityLogger';
import { redirectAfterLogin, isRunningInApp } from '../lib/deepLink';

// ── Human-readable error map ──────────────────────────────────
const ERROR_MAP: Record<string, string> = {
  'Invalid login credentials':        'Incorrect email or password. Please try again.',
  'Email not confirmed':              'Please verify your email first. Check your inbox.',
  'User already registered':          'An account with this email already exists. Sign in instead.',
  'Password should be at least 6 characters': 'Password must be at least 6 characters.',
  'signup_disabled':                  'New signups are currently disabled.',
  'over_email_send_rate_limit':       'Too many emails sent. Please wait a minute and try again.',
  'invalid_email':                    'Please enter a valid email address.',
  'weak_password':                    'Password is too weak. Use letters, numbers, and symbols.',
};

function humanError(raw: string): string {
  for (const [key, msg] of Object.entries(ERROR_MAP)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return msg;
  }
  return raw || 'Something went wrong. Please try again.';
}

// ── Password strength ─────────────────────────────────────────
function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map = [
    { label: 'Weak',   color: '#FF5252' },
    { label: 'Fair',   color: '#FF9E40' },
    { label: 'Good',   color: '#FFE57F' },
    { label: 'Strong', color: '#00D4AA' },
  ];
  const entry = map[Math.min(score, 3)];
  return { score, ...entry };
}

type AuthMode = 'signin' | 'signup' | 'forgot';

export function Auth() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const navigate = useNavigate();

  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);

  const pwStrength = getPasswordStrength(password);

  // ── Reset state on mode switch ───────────────────────────────
  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setSuccess(null);
    setPassword('');
  };

  // ── Email / Password auth ────────────────────────────────────
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      // ── ADMIN MOCK LOGIN (demo-only, no Supabase call) ──
      if (mode === 'signin' && email === 'admin@aura.ai' && password === 'AuraAdmin2024') {
        const mockUser = { id: 'admin-mock-user', email: 'admin@aura.ai', role: 'admin' } as any;
        const mockSession = { user: mockUser, access_token: 'admin-mock-token' } as any;
        useAuthStore.getState().setAdminMock(true);
        useAuthStore.getState().setUser(mockUser);
        useAuthStore.getState().setSession(mockSession);
        useAuthStore.getState().setLoading(false);
        activityLogger.disable(); // don't log admin mock activity to DB
        navigate('/dashboard');
        return;
      }

      if (mode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        activityLogger.log('login', { metadata: { method: 'email' } });
        // If running in WebView app → stay in app (already there)
        // If on web browser → try to open native app, fallback to /dashboard
        if (isRunningInApp()) {
          navigate('/dashboard');
        } else {
          redirectAfterLogin();
          // Small delay so deep link fires before navigation
          setTimeout(() => navigate('/dashboard'), 300);
        }

      } else if (mode === 'signup') {
        if (password.length < 6) {
          throw new Error('Password should be at least 6 characters');
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            // Redirect after email confirmation (set in Supabase dashboard too)
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        if (error) throw error;

        // Check if confirmation email was sent
        if (data.session) {
          // Email confirmations disabled — user is immediately active → OTP verify
          activityLogger.log('signup', { metadata: { method: 'email', display_name: displayName } });
          if (isRunningInApp()) {
            navigate(`/verify-otp?purpose=signup_verify&email=${encodeURIComponent(email)}`);
          } else {
            redirectAfterLogin();
            setTimeout(() => navigate(`/verify-otp?purpose=signup_verify&email=${encodeURIComponent(email)}`), 300);
          }
        } else {
          // Email confirmation required via Supabase link
          setSuccess('Check your inbox! We sent you a confirmation link.');
        }

      } else if (mode === 'forgot') {
        const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://auraweapp.vercel.app';
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${SITE_URL}/auth?mode=reset`,
        });
        if (error) throw error;
        setSuccess('Password reset email sent. Check your inbox.');
      }

    } catch (err: any) {
      setError(humanError(err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  // ── OAuth ────────────────────────────────────────────────────
  const handleOAuth = async (provider: 'google' | 'github') => {
    setError(null);
    // Always redirect to production URL after OAuth.
    // If AURA app is installed + App Links verified → Android OS opens it directly.
    // Otherwise → user lands on the Vercel web dashboard.
    const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://auraweapp.vercel.app';
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${SITE_URL}/dashboard`,
        scopes: provider === 'github' ? 'user:email' : undefined,
      },
    });
    if (error) setError(humanError(error.message));
    else activityLogger.log('oauth_login', { metadata: { provider } });
  };

  const modeTitle = { signin: 'Welcome back', signup: 'Create an account', forgot: 'Reset password' };
  const modeSub   = { signin: 'Sign in to your account', signup: 'Join AURA today', forgot: 'Enter your email to receive a reset link' };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-screen w-full bg-bg flex items-center justify-center p-4 relative overflow-hidden"
    >
      {/* Background dots */}
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:20px_20px]" />

      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-[#00D4AA] opacity-5 blur-3xl pointer-events-none" />

      <motion.div
        initial={{ y: 40, opacity: 0, filter: 'blur(10px)' }}
        animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md bg-surface backdrop-blur-2xl border border-stroke rounded-3xl p-8 relative z-10 shadow-2xl"
      >
        {/* Back button (forgot password mode) */}
        {mode === 'forgot' && (
          <button
            onClick={() => switchMode('signin')}
            className="flex items-center gap-2 text-muted hover:text-text-primary text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to sign in
          </button>
        )}

        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-full accent-gradient flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(0,212,170,0.3)]">
            <span className="italic font-display text-2xl text-bg">A</span>
          </div>
          <h1 className="text-3xl font-display italic text-text-primary mb-2">
            {modeTitle[mode]}
          </h1>
          <p className="text-muted text-center text-sm">{modeSub[mode]}</p>
        </div>

        {/* OAuth (only on signin/signup) */}
        {mode !== 'forgot' && (
          <>
            <div className="space-y-3 mb-6">
              <button
                onClick={() => handleOAuth('google')}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-stroke text-text-primary hover:bg-stroke/50 hover:border-[#00D4AA]/40 transition-all font-medium"
              >
                <Chrome className="w-5 h-5" /> Continue with Google
              </button>
              <button
                onClick={() => handleOAuth('github')}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-stroke text-text-primary hover:bg-stroke/50 hover:border-[#00D4AA]/40 transition-all font-medium"
              >
                <Github className="w-5 h-5" /> Continue with GitHub
              </button>
            </div>

            <div className="flex items-center gap-4 mb-6">
              <div className="h-[1px] flex-1 bg-stroke" />
              <span className="text-xs text-muted uppercase tracking-wider">or continue with email</span>
              <div className="h-[1px] flex-1 bg-stroke" />
            </div>
          </>
        )}

        {/* Error / Success banners */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-200">{error}</p>
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-4 p-3 bg-[#00D4AA]/10 border border-[#00D4AA]/20 rounded-xl flex items-start gap-3"
            >
              <CheckCircle className="w-5 h-5 text-[#00D4AA] shrink-0 mt-0.5" />
              <p className="text-sm text-[#00D4AA]">{success}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          {/* Display name (signup only) */}
          {mode === 'signup' && (
            <div className="relative">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <User className="w-5 h-5 text-muted" />
              </div>
              <input
                id="displayName"
                type="text"
                placeholder="Display Name"
                autoComplete="name"
                className="w-full bg-bg border border-stroke rounded-xl pl-12 pr-4 py-3 text-text-primary placeholder:text-muted focus:outline-none focus:border-[#00D4AA] focus:ring-1 focus:ring-[#00D4AA] transition-all"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
          )}

          {/* Email */}
          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Mail className="w-5 h-5 text-muted" />
            </div>
            <input
              id="email"
              type="email"
              placeholder="Email address"
              autoComplete={mode === 'signup' ? 'email' : 'username'}
              className="w-full bg-bg border border-stroke rounded-xl pl-12 pr-4 py-3 text-text-primary placeholder:text-muted focus:outline-none focus:border-[#00D4AA] focus:ring-1 focus:ring-[#00D4AA] transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* Password (hidden on forgot mode) */}
          {mode !== 'forgot' && (
            <div className="relative">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Lock className="w-5 h-5 text-muted" />
              </div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="w-full bg-bg border border-stroke rounded-xl pl-12 pr-12 py-3 text-text-primary placeholder:text-muted focus:outline-none focus:border-[#00D4AA] focus:ring-1 focus:ring-[#00D4AA] transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'signup' ? 6 : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-4 flex items-center text-muted hover:text-text-primary transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          )}

          {/* Password strength (signup only) */}
          {mode === 'signup' && password && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[0,1,2,3].map((i) => (
                  <div
                    key={i}
                    className="h-1 flex-1 rounded-full transition-all duration-300"
                    style={{ backgroundColor: i < pwStrength.score ? pwStrength.color : 'var(--stroke)' }}
                  />
                ))}
              </div>
              <p className="text-xs text-muted" style={{ color: pwStrength.color }}>
                {pwStrength.label}
              </p>
            </div>
          )}

          {/* Forgot password link (signin only) */}
          {mode === 'signin' && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-xs text-muted hover:text-[#00D4AA] transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            id="auth-submit-btn"
            className="w-full py-3 rounded-xl accent-gradient text-bg font-semibold hover:opacity-90 transition-opacity mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? 'Processing…'
              : mode === 'signin' ? 'Sign In'
              : mode === 'signup' ? 'Create Account'
              : 'Send Reset Link'}
          </button>
        </form>

        {/* Mode switcher */}
        {mode !== 'forgot' && (
          <div className="mt-6 text-center">
            <button
              onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
              className="text-sm text-muted hover:text-text-primary transition-colors"
            >
              {mode === 'signin'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
