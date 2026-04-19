/**
 * AURA — useActivityTracker hook
 *
 * Usage:
 *   // Auto-track page visit on mount:
 *   const { trackEvent } = useActivityTracker('page_visit', { page: '/dashboard' });
 *
 *   // Track a button click:
 *   trackEvent('button_click', { button: 'refresh_aqi' });
 */
import { useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { activityLogger, ActionType } from '../lib/activityLogger';

export function useActivityTracker(
  autoAction?: ActionType,
  autoMetadata?: Record<string, unknown>
) {
  const location = useLocation();

  // Auto-log on mount (e.g. page visit)
  useEffect(() => {
    if (autoAction) {
      activityLogger.log(autoAction, {
        page: location.pathname,
        metadata: autoMetadata,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual event tracker — memoized so it doesn't cause re-renders
  const trackEvent = useCallback(
    (action: ActionType, metadata?: Record<string, unknown>) => {
      activityLogger.log(action, {
        page: location.pathname,
        metadata,
      });
    },
    [location.pathname]
  );

  return { trackEvent };
}
