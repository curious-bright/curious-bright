import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { pageview } from '../lib/analytics';

/** Send one sanitized pageview per route change. */
export default function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    // Never send query strings or dynamic IDs: search terms and tokens are personal.
    pageview(location.pathname);
  }, [location.pathname]);

  return null;
}
