import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { pageview } from '../lib/analytics';

/** Record one coarse pageview per route. Query strings are never sent. */
export default function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    pageview(location.pathname);
  }, [location.pathname]);

  return null;
}
