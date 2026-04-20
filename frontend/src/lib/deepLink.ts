/**
 * AURA — Deep Link & App Redirect Utility
 *
 * HOW IT WORKS:
 *   - After login/signup, try to open the native app via custom scheme (aura://)
 *   - If app is not installed → falls back to the web URL gracefully
 *   - Works for: Google OAuth, email login, password reset, email confirmation
 *
 * SCHEME: aura://
 *   aura://dashboard       → /dashboard
 *   aura://auth            → /auth
 *   aura://reset-password  → /auth?mode=reset
 *   aura://map             → /map
 *   aura://analytics       → /analytics
 *   aura://settings        → /settings
 */

const APP_SCHEME = 'aura';
const VERCEL_URL = 'https://auraweapp.vercel.app';
const NETLIFY_URL = 'https://aura-air-quality.netlify.app';

// Map of web paths → deep link paths
const ROUTE_MAP: Record<string, string> = {
  '/dashboard':     'dashboard',
  '/map':           'map',
  '/analytics':     'analytics',
  '/settings':      'settings',
  '/auth':          'auth',
  '/registration':  'registration',
};

/**
 * Detects if running inside the Capacitor/Android WebView.
 * Inside the app, window.Capacitor is injected by the native layer.
 */
export function isRunningInApp(): boolean {
  return typeof (window as any).Capacitor !== 'undefined';
}

/**
 * Detects if user is on Android based on user agent.
 */
export function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

/**
 * Tries to open the native AURA app via deep link.
 * Falls back to the web URL if the app is not installed.
 *
 * @param path - web path like '/dashboard' or '/auth?mode=reset'
 * @param fallbackUrl - optional override for fallback URL
 */
export function openInApp(path: string = '/dashboard', fallbackUrl?: string): void {
  // If already inside the app (Capacitor WebView), no redirect needed
  if (isRunningInApp()) return;

  // Build deep link: aura://dashboard
  const basePath = path.split('?')[0];
  const query = path.includes('?') ? path.substring(path.indexOf('?')) : '';
  const deepLinkPath = ROUTE_MAP[basePath] || basePath.replace(/^\//, '');
  const deepLink = `${APP_SCHEME}://${deepLinkPath}${query}`;

  // Build web fallback URL
  const webFallback = fallbackUrl || `${VERCEL_URL}${path}`;

  if (isAndroid()) {
    // Android: try deep link with a timed fallback
    // If app is installed → OS intercepts aura:// immediately
    // If not installed → after 1.5s, redirect to web
    const start = Date.now();
    window.location.href = deepLink;

    setTimeout(() => {
      // If the page is still active (app not installed), go to web
      if (Date.now() - start < 2000) {
        window.location.href = webFallback;
      }
    }, 1500);
  } else {
    // Non-Android (desktop/iOS web): go straight to web URL
    window.location.href = webFallback;
  }
}

/**
 * Redirects to the primary URL with Netlify as automatic fallback.
 * Used for failover: if Vercel is down, Netlify serves the app.
 */
export async function navigateWithFailover(path: string = '/dashboard'): Promise<void> {
  const primary = `${VERCEL_URL}${path}`;
  const fallback = `${NETLIFY_URL}${path}`;

  try {
    const res = await fetch(`${VERCEL_URL}/favicon.svg`, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
    });
    window.location.href = primary;
  } catch {
    // Vercel unreachable → use Netlify
    console.warn('[AURA] Vercel unreachable, switching to Netlify');
    window.location.href = fallback;
  }
}

/**
 * After successful login, redirect user into the app (if installed) or dashboard.
 */
export function redirectAfterLogin(): void {
  openInApp('/dashboard');
}

/**
 * After password reset link clicked — open app on reset screen.
 */
export function redirectToResetPassword(token?: string): void {
  const path = token ? `/auth?mode=reset&token=${token}` : '/auth?mode=reset';
  openInApp(path);
}
