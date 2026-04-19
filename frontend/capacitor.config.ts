import { CapacitorConfig } from '@capacitor/cli';

/**
 * AURA — Capacitor (WebView) Configuration
 *
 * HOW UPDATES WORK:
 *   Push code to GitHub → Vercel auto-deploys → APK loads latest version instantly.
 *   No APK rebuild needed. The app is a WebView that always loads the live URL.
 *
 * MODES:
 *   Production (APK):  server.url = VERCEL_URL (live, auto-updated)
 *   Development:       server.url = localhost:3000 (local dev server)
 */

// ── URLs ─────────────────────────────────────────────────────
// Replace with your actual Vercel production URL after first deploy
const VERCEL_URL  = 'https://auraweapp.vercel.app';
const NETLIFY_URL = 'https://aura-air-quality.netlify.app';  // fallback

// Set to true for local dev, false for production APK build
const IS_DEV = false;
const LOCAL_URL = 'http://192.168.0.108:3000';

const config: CapacitorConfig = {
  appId: 'com.aura.airquality',
  appName: 'AURA Air Quality',

  // In production, webDir is ignored (we load from server.url below).
  // Keep it set so `npx cap sync` still works.
  webDir: 'dist',

  server: {
    // ── Live WebView Mode (production) ─────────────────────────
    // Load directly from Vercel → instant updates on every GitHub push.
    // Comment this out only if you want a fully offline/bundled APK.
    url: IS_DEV ? LOCAL_URL : VERCEL_URL,

    // Required for browser APIs (geolocation, service workers) on Android
    androidScheme: 'https',

    // Allow both https and http (needed for some API calls)
    allowNavigation: [
      VERCEL_URL,
      NETLIFY_URL,
      'https://*.supabase.co',
      'https://igysgcpgxaejrfyzqbhe.supabase.co',
      'https://aura-air-api.onrender.com',
    ],

    // Dev only: allow cleartext for localhost
    cleartext: IS_DEV,
  },

  plugins: {
    Geolocation: {
      permissions: ['location'],
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0A0F1E',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
    },
  },

  android: {
    allowMixedContent: false,        // false in production for security
    captureInput: true,
    webContentsDebuggingEnabled: IS_DEV,  // only debug in dev
    backgroundColor: '#0A0F1E',
  },

  ios: {
    // Dark background while WebView loads
    backgroundColor: '#0A0F1E',
    // Allow scrolling to handle content larger than viewport
    scrollEnabled: true,
    // Use WKWebView limitsNavigationsToAppBoundDomains for security
    limitsNavigationsToAppBoundDomains: false,
    // Preferred content mode
    preferredContentMode: 'mobile',
  },
};

export default config;
