import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { track } from '../lib/analytics';

/** Record one coarse pageview per route. Query strings are never sent. */
export default function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    track('pageview', { path: location.pathname });
  }, [location.pathname]);

  return null;
}
