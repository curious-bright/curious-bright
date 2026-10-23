import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { track } from '../lib/analytics';

/** Send one sanitized pageview per route change. */
export default function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    // Never send query strings: search terms and invite tokens are personal.
    track('pageview', { path: location.pathname });
  }, [location.pathname]);

  return null;
}
