/**
 * AURA — OTP Verification Page
 * Route: /verify-otp?purpose=signup_verify&email=user@example.com
 *
 * ✅ Uses Supabase Auth natively — NO Flask backend required for OTP.
 *    Supabase sends the email automatically via its built-in email service.
 *
 * Flow:
 *  1. Page loads → auto-sends OTP via Supabase Auth
 *  2. User enters 6-digit code
 *  3. On success → redirect to /registration (signup) or /dashboard (login/reset)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, RotateCcw, ShieldCheck, ArrowLeft } from 'lucide-react';
import { OTPInput } from '../components/OTPInput';
import { useAuthStore } from '../store/authStore';
import { activityLogger } from '../lib/activityLogger';
import { supabase } from '../lib/supabase';

type Stage = 'idle' | 'sending' | 'waiting' | 'verifying' | 'success' | 'error';

// Supabase OTP token types per purpose
type SupabaseOtpType = 'signup' | 'email' | 'recovery';

interface PurposeMeta {
  title: string;
  subtitle: string;
  redirectTo: string;
  otpType: SupabaseOtpType;
}

const PURPOSE_CONFIG: Record<string, PurposeMeta> = {
  signup_verify: {
    title: 'Verify your email',
    subtitle: 'Complete your account setup',
    redirectTo: '/registration',
    otpType: 'signup',
  },
  login_2fa: {
    title: 'Two-factor auth',
    subtitle: "Confirm it's really you",
    redirectTo: '/dashboard',
    otpType: 'email',
  },
  password_reset: {
    title: 'Reset your password',
    subtitle: 'Secure your account',
    redirectTo: '/dashboard',
    otpType: 'recovery',
  },
};

export function OTPVerification() {
  const navigate    = useNavigate();
  const [params]    = useSearchParams();
  const { session } = useAuthStore();

  const purpose    = params.get('purpose') || 'signup_verify';
  const emailParam = params.get('email') || session?.user?.email || '';

  const meta = PURPOSE_CONFIG[purpose] || PURPOSE_CONFIG.signup_verify;

  const [stage,      setStage]      = useState<Stage>('idle');
  const [otp,        setOtp]        = useState('');
  const [hasError,   setHasError]   = useState(false);
  const [errorMsg,   setErrorMsg]   = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [cooldown,   setCooldown]   = useState(0); // seconds until resend enabled

  // ── Cooldown timer ──────────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // ── Send OTP via Supabase Auth (no Flask backend needed) ────
  const sendOtp = useCallback(async (isResend = false) => {
    if (!emailParam) {
      setErrorMsg('No email found. Please go back and try again.');
      setHasError(true);
      return;
    }

    setStage('sending');
    setHasError(false);
    setErrorMsg('');

    try {
      let authError;

      if (purpose === 'signup_verify') {
        // Resend the signup confirmation OTP
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: emailParam,
        });
        authError = error;

      } else if (purpose === 'password_reset') {
        // Trigger password reset OTP email
        const { error } = await supabase.auth.resetPasswordForEmail(emailParam, {
          redirectTo: `${window.location.origin}/dashboard`,
        });
        authError = error;

      } else {
        // login_2fa — sign in with OTP (Supabase sends 6-digit code to email)
        const { error } = await supabase.auth.signInWithOtp({
          email: emailParam,
          options: {
            shouldCreateUser: false, // only for existing users
          },
        });
        authError = error;
      }

      if (authError) {
        // Handle rate limiting gracefully
        const isRateLimit = authError.message?.toLowerCase().includes('rate') ||
                            authError.status === 429;
        setErrorMsg(
          isRateLimit
            ? 'Too many requests. Please wait a minute before trying again.'
            : authError.message || 'Failed to send OTP. Please try again.'
        );
        setHasError(true);
        setStage('error');
        if (isRateLimit) setCooldown(60);
        return;
      }

      setStage('waiting');
      setCooldown(60); // 60-second resend cooldown

      if (isResend) {
        activityLogger.log('feature_used', { metadata: { feature: 'otp_resend', purpose } });
      }

    } catch (err) {
      setErrorMsg('Unexpected error. Please check your connection and try again.');
      setHasError(true);
      setStage('error');
    }
  }, [emailParam, purpose]);

  // Auto-send on page load
  useEffect(() => { sendOtp(false); }, []);

  // ── Auto-verify when all 6 digits entered ──────────────────
  useEffect(() => {
    if (otp.length === 6 && stage === 'waiting') {
      verifyOtp(otp);
    }
  }, [otp]);

  const verifyOtp = async (code: string) => {
    setStage('verifying');
    setHasError(false);
    setErrorMsg('');

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: emailParam,
        token: code,
        type: meta.otpType,
      });

      if (error) {
        setErrorMsg(
          error.message?.includes('expired')
            ? 'OTP has expired. Please request a new code.'
            : error.message?.includes('invalid')
            ? 'Incorrect code. Please check and try again.'
            : error.message || 'Invalid OTP. Please try again.'
        );
        setHasError(true);
        setOtp('');
        setStage('waiting');
        return;
      }

      // ✅ Verified successfully
      setStage('success');
      setSuccessMsg('Email verified! Redirecting…');
      activityLogger.log('feature_used', { metadata: { feature: 'otp_verified', purpose } });
      setTimeout(() => navigate(meta.redirectTo), 1800);

    } catch {
      setErrorMsg('Verification failed. Please try again.');
      setHasError(true);
      setStage('waiting');
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length === 6) verifyOtp(otp);
  };

  const isLoading = stage === 'sending' || stage === 'verifying';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-screen w-full bg-bg flex items-center justify-center p-4 relative overflow-hidden"
    >
      {/* Background */}
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:20px_20px]" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-[#00D4AA] opacity-5 blur-3xl pointer-events-none" />

      <motion.div
        initial={{ y: 40, opacity: 0, filter: 'blur(10px)' }}
        animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md bg-surface backdrop-blur-2xl border border-stroke rounded-3xl p-8 relative z-10 shadow-2xl"
      >
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted hover:text-text-primary text-sm mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <AnimatePresence mode="wait">
            {stage === 'success' ? (
              <motion.div
                key="success-icon"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-14 h-14 rounded-full bg-[#00D4AA]/15 border border-[#00D4AA]/30 flex items-center justify-center mb-4"
              >
                <CheckCircle className="w-7 h-7 text-[#00D4AA]" />
              </motion.div>
            ) : (
              <motion.div
                key="shield-icon"
                className="w-14 h-14 rounded-full accent-gradient flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(0,212,170,0.3)]"
              >
                <ShieldCheck className="w-7 h-7 text-bg" />
              </motion.div>
            )}
          </AnimatePresence>

          <h1 className="text-2xl font-display italic text-text-primary mb-2 text-center">
            {stage === 'success' ? 'Verified!' : meta.title}
          </h1>
          <p className="text-muted text-center text-sm">
            {stage === 'sending'
              ? 'Sending code to your email…'
              : stage === 'success'
              ? successMsg
              : <>Code sent to <span className="text-[#00D4AA] font-medium">{emailParam}</span></>
            }
          </p>
        </div>

        {/* Error banner */}
        <AnimatePresence>
          {hasError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-200">{errorMsg}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* OTP form */}
        {stage !== 'success' && (
          <form onSubmit={handleManualSubmit} className="space-y-8">
            {/* 6-box OTP input */}
            <div className="py-2">
              <OTPInput
                onChange={setOtp}
                disabled={isLoading || stage === 'sending'}
                error={hasError}
                autoFocus
              />
            </div>

            {/* Status or submit button */}
            {stage === 'sending' ? (
              <div className="flex items-center justify-center gap-3 text-muted text-sm">
                <div className="w-4 h-4 border-2 border-stroke border-t-[#00D4AA] rounded-full animate-spin" />
                Sending OTP…
              </div>
            ) : (
              <button
                type="submit"
                disabled={otp.length < 6 || isLoading}
                id="otp-verify-btn"
                className="w-full py-3 rounded-xl accent-gradient text-bg font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {stage === 'verifying' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-bg/40 border-t-bg rounded-full animate-spin" />
                    Verifying…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Verify Code
                  </>
                )}
              </button>
            )}

            {/* Resend */}
            <div className="text-center">
              {cooldown > 0 ? (
                <p className="text-sm text-muted">
                  Resend available in <span className="text-text-primary font-mono font-bold">{cooldown}s</span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => { setOtp(''); sendOtp(true); }}
                  disabled={isLoading}
                  className="flex items-center gap-2 text-sm text-[#00D4AA] hover:opacity-80 transition-opacity mx-auto disabled:opacity-40"
                >
                  <RotateCcw className="w-4 h-4" /> Resend code
                </button>
              )}
            </div>
          </form>
        )}

        {/* Success animation */}
        {stage === 'success' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <div className="w-full h-1 bg-stroke rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.8, ease: 'easeInOut' }}
                className="h-full bg-[#00D4AA] rounded-full"
              />
            </div>
            <p className="text-sm text-muted mt-3">Redirecting to {meta.redirectTo}…</p>
          </motion.div>
        )}

        {/* Hint */}
        {stage === 'waiting' && (
          <p className="text-xs text-muted text-center mt-4">
            Check your spam folder if you don't see the email. Code expires in 10 minutes.
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
