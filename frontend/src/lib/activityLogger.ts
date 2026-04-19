/**
 * AURA — Activity Logger (Singleton)
 *
 * Fire-and-forget activity tracking. Uses a micro-queue to batch up to 5
 * events before flushing, or flushes after 2 seconds — whichever comes first.
 * Never blocks the UI or throws errors to the caller.
 */
import { supabase } from './supabase';

export type ActionType =
  // Auth events
  | 'login'
  | 'logout'
  | 'signup'
  | 'password_reset_request'
  | 'oauth_login'
  // Navigation
  | 'page_visit'
  // Dashboard
  | 'aqi_data_fetched'
  | 'aqi_refresh'
  | 'location_detected'
  | 'location_denied'
  // Map
  | 'map_city_selected'
  | 'map_marker_click'
  | 'map_filter_changed'
  | 'map_heatmap_toggled'
  | 'map_report_generated'
  // Analytics
  | 'analytics_viewed'
  // Settings
  | 'settings_saved'
  | 'settings_threshold_changed'
  | 'settings_notifications_toggled'
  // AI / Reports
  | 'ai_advisory_requested'
  | 'report_downloaded'
  // General
  | 'button_click'
  | 'search_performed'
  | 'feature_used'
  | 'error_occurred';

interface QueuedEvent {
  user_id: string;
  user_email: string | null;
  action_type: ActionType;
  page: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

class ActivityLogger {
  private queue: QueuedEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_SIZE = 5;
  private readonly FLUSH_INTERVAL_MS = 2000;
  private isEnabled = true;

  /**
   * Log a user action. Fire-and-forget — never throws.
   */
  async log(
    actionType: ActionType,
    options: {
      page?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    if (!this.isEnabled) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Skip logging for unauthenticated users (except login/signup)
      if (!session?.user && !['login', 'signup', 'oauth_login'].includes(actionType)) {
        return;
      }

      const userId = session?.user?.id;
      // For anonymous auth actions, skip (no user_id to store)
      if (!userId && !['login', 'signup'].includes(actionType)) return;
      if (!userId) return;

      const event: QueuedEvent = {
        user_id: userId,
        user_email: session?.user?.email ?? null,
        action_type: actionType,
        page: options.page ?? (typeof window !== 'undefined' ? window.location.pathname : null),
        metadata: options.metadata ?? {},
        created_at: new Date().toISOString(),
      };

      this.queue.push(event);

      if (this.queue.length >= this.BATCH_SIZE) {
        this.flush();
      } else {
        this.scheduleFlush();
      }
    } catch {
      // Never let tracking errors surface to the user
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL_MS);
  }

  private async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.BATCH_SIZE);
    try {
      await supabase.from('user_activity_logs').insert(batch);
    } catch {
      // Silently discard on error — tracking must not affect UX
    }
  }

  /** Disable tracking (e.g. for admin mock sessions) */
  disable(): void { this.isEnabled = false; }
  enable(): void  { this.isEnabled = true; }
}

// Singleton instance — import this everywhere
export const activityLogger = new ActivityLogger();
