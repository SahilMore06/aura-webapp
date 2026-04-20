/**
 * AURA — ML API Client
 * Production-grade fetch wrapper for the Render ML service.
 *
 * Features:
 *  - Automatic retry with exponential back-off
 *  - Per-request timeout (no hanging promises)
 *  - Graceful fallback values when API is down
 *  - Request deduplication cache (avoid duplicate in-flight requests)
 *  - Console warnings so Sentry/logs can catch real outages
 */

const ML_BASE_URL =
  (import.meta.env.VITE_ML_API_URL as string) || 'https://aura-air-api.onrender.com';

// ── Configuration ─────────────────────────────────────────────
const DEFAULT_TIMEOUT_MS   = 10_000;   // 10 s per attempt
const DEFAULT_RETRIES       = 2;        // total 3 attempts
const BACKOFF_BASE_MS       = 800;      // 0.8 s → 1.6 s → 3.2 s

// ── In-flight request deduplication ──────────────────────────
const inFlight = new Map<string, Promise<Response>>();

// ── Helpers ───────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`[AURA ML] Timeout after ${ms}ms — ${label}`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// ── Core fetch with retry + back-off ─────────────────────────

async function mlFetch(
  endpoint: string,
  options: RequestInit = {},
  retries = DEFAULT_RETRIES,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const url = `${ML_BASE_URL}${endpoint}`;
  const key  = `${options.method ?? 'GET'}:${url}:${options.body ?? ''}`;

  // Return existing promise if same request already in-flight
  if (inFlight.has(key)) return inFlight.get(key)!;

  const attempt = async (): Promise<Response> => {
    for (let i = 0; i <= retries; i++) {
      try {
        const fetchPromise = fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'X-Client': 'AURA-Frontend/1.0',
            ...(options.headers ?? {}),
          },
        });

        const res = await withTimeout(fetchPromise, timeoutMs, endpoint);

        if (!res.ok) {
          throw new Error(`[AURA ML] HTTP ${res.status} from ${endpoint}`);
        }

        return res;
      } catch (err) {
        const isLastAttempt = i === retries;
        if (isLastAttempt) throw err;

        const delay = BACKOFF_BASE_MS * Math.pow(2, i);
        console.warn(`[AURA ML] Attempt ${i + 1} failed for ${endpoint}. Retrying in ${delay}ms…`, err);
        await sleep(delay);
      }
    }
    throw new Error('[AURA ML] All retries exhausted');
  };

  const promise = attempt().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

// ── Public API methods ────────────────────────────────────────

export interface AQIPrediction {
  predicted_aqi:      number;
  aqi_category:       string;
  health_risk:        string;
  dominant_pollutant: string;
  confidence:         number;
}

export interface CityQuality {
  city:             string;
  aqi:              number;
  category:         string;
  health_risk:      string;
  dominant_pollutant: string;
}

/** Fallback when ML API is completely down */
const FALLBACK_PREDICTION: AQIPrediction = {
  predicted_aqi:      0,
  aqi_category:       'Unavailable',
  health_risk:        'ML service temporarily offline',
  dominant_pollutant: '—',
  confidence:         0,
};

/**
 * GET /predict — Predict AQI for a city
 */
export async function predictAQI(city: string): Promise<AQIPrediction> {
  try {
    const res = await mlFetch(`/predict?city=${encodeURIComponent(city)}`);
    return res.json();
  } catch (err) {
    console.error('[AURA ML] predictAQI failed, using fallback:', err);
    return { ...FALLBACK_PREDICTION };
  }
}

/**
 * GET /cities/quality — Ranked list of cities by AQI
 */
export async function fetchCitiesQuality(): Promise<CityQuality[]> {
  try {
    const res = await mlFetch('/cities/quality');
    return res.json();
  } catch (err) {
    console.error('[AURA ML] fetchCitiesQuality failed, using fallback:', err);
    return [];
  }
}

/**
 * POST /predict — Full prediction with pollutant breakdown
 */
export async function predictAQIPost(payload: Record<string, unknown>): Promise<AQIPrediction> {
  try {
    const res = await mlFetch('/predict', {
      method:  'POST',
      body:    JSON.stringify(payload),
    });
    return res.json();
  } catch (err) {
    console.error('[AURA ML] predictAQIPost failed, using fallback:', err);
    return { ...FALLBACK_PREDICTION };
  }
}

/**
 * GET /health — Ping the ML service
 */
export async function checkMLHealth(): Promise<boolean> {
  try {
    await mlFetch('/health', {}, 0, 5_000);
    return true;
  } catch {
    return false;
  }
}
