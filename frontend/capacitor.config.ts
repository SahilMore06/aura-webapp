import { CapacitorConfig } from '@capacitor/cli';

/**
 * AURA — Capacitor (WebView) Configuration
 *
 * ARCHITECTURE:
 *   WebView loads live Vercel URL → instant updates on every push.
 *   Falls back to Netlify if Vercel is unreachable.
 *   Offline screen served from bundled HTML if both are down.
 *
 * MODES:
 *   Production (APK):  server.url = VERCEL_URL
 *   Development:       server.url = LOCAL_URL (set IS_DEV = true)
 */

// ── URLs ─────────────────────────────────────────────────────
const VERCEL_URL  = 'https://auraweapp.vercel.app';
const NETLIFY_URL = 'https://aura-air-quality.netlify.app';

const IS_DEV    = false;
const LOCAL_URL = 'http://192.168.0.108:5173';

const config: CapacitorConfig = {
  appId:   'com.aura.airquality',
  appName: 'AURA Air Quality',
  webDir:  'dist',

  server: {
    // ── Live WebView mode ────────────────────────────────────
    url: IS_DEV ? LOCAL_URL : VERCEL_URL,

    // Required for browser APIs (geolocation, camera) on Android
    androidScheme: 'https',

    // Whitelist all domains the WebView is allowed to navigate to
    allowNavigation: [
      'auraweapp.vercel.app',
      'aura-air-quality.netlify.app',
      '*.supabase.co',
      'igysgcpgxaejrfyzqbhe.supabase.co',
      'aura-air-api.onrender.com',
      'air-quality-api.open-meteo.com',
      'airquality.googleapis.com',
      'ipapi.co',
      'fonts.googleapis.com',
      'fonts.gstatic.com',
    ],

    cleartext: IS_DEV,
  },

  plugins: {
    Geolocation: {
      permissions: ['location'],
    },
    SplashScreen: {
      launchShowDuration:      2000,
      backgroundColor:         '#0A0F1E',
      showSpinner:             false,
      androidSplashResourceName: 'splash',
      androidScaleType:        'CENTER_CROP',
      launchAutoHide:          true,
      splashFullScreen:        true,
      splashImmersive:         true,
    },
    App: {
      // Handle hardware back button
    },
  },

  android: {
    allowMixedContent:           false,
    captureInput:                true,
    webContentsDebuggingEnabled: IS_DEV,
    backgroundColor:             '#0A0F1E',
    // Custom URL scheme for deep links
    customUrlScheme:             'aura',
  },

  ios: {
    backgroundColor:                  '#0A0F1E',
    scrollEnabled:                    true,
    limitsNavigationsToAppBoundDomains: false,
    preferredContentMode:             'mobile',
  },
};

export default config;
