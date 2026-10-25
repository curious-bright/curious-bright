/**
 * Privacy-first Umami integration. Only route names and coarse product events
 * are sent; message bodies, email addresses, search queries and other personal
 * data must never be passed to `track`.
 */
type EventData = Record<string, string | number | boolean>;
type PageviewProps = Record<string, unknown>;

declare global {
  interface Window {
    umami?: {
      track: {
        (): void;
        (name: string, data?: EventData): void;
        (payload: PageviewProps): void;
        (
          callback: (
            props: PageviewProps,
          ) => PageviewProps & { name?: string; data?: EventData },
        ): void;
      };
    };
  }
}

const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
const scriptUrl = env.VITE_UMAMI_SCRIPT_URL;
const websiteId = env.VITE_UMAMI_WEBSITE_ID;
let started = false;
type Queued =
  | { kind: 'pageview'; path: string }
  | { kind: 'event'; name: string; data?: EventData; path: string };
const queue: Queued[] = [];

/**
 * Umami is deliberately self-hosted and cookieless. We also refuse to load or
 * send anything when the visitor has asked not to be tracked. Empty build-time
 * env vars keep the entire integration inert (local development, tests and
 * self-hosted deployments that have not configured analytics yet).
 */
export function analyticsConfigured(): boolean {
  return Boolean(scriptUrl && websiteId);
}

export function doNotTrackEnabled(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const nav = navigator as Navigator & {
    globalPrivacyControl?: boolean | string;
    msDoNotTrack?: string | number;
  };
  const signals = [
    nav.doNotTrack,
    nav.msDoNotTrack,
    (window as { doNotTrack?: string | number }).doNotTrack,
  ];
  return (
    signals.some((value) => value === '1' || value === 1 || value === 'yes') ||
    nav.globalPrivacyControl === true ||
    nav.globalPrivacyControl === '1'
  );
}

/** Replace IDs, usernames and tokens so pageviews never carry them. */
export function sanitizePath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname
    .replace(/\/invitations\/[^/]+/i, '/invitations/:token')
    .replace(/\/verification\/email\/[^/]+/i, '/verification/email/:token')
    .replace(/\/post\/[^/]+/i, '/post/:id')
    .replace(/\/profile\/[^/]+/i, '/profile/:username')
    .replace(/\/research\/[^/]+/i, '/research/:id')
    .replace(/\/messages\/[^/]+/i, '/messages/:id')
    .replace(/\/room\/[^/]+/i, '/room/:id')
    .replace(/\/read\/[^/]+/i, '/read/:id');
}

function currentPath(): string {
  return typeof window === 'undefined' ? '/' : sanitizePath(window.location.pathname);
}

/** Send one Umami pageview with a sanitized, static route path. */
export function pageview(path = '/'): void {
  if (!analyticsConfigured() || doNotTrackEnabled()) return;
  const safePath = sanitizePath(path);
  if (window.umami) {
    window.umami.track((props) => ({
      ...props,
      url: safePath,
      title: safePath,
      referrer: '',
    }));
    return;
  }
  queue.push({ kind: 'pageview', path: safePath });
}

export function track(name: string, data?: EventData): void {
  if (!analyticsConfigured() || doNotTrackEnabled()) return;
  const safePath = currentPath();
  if (window.umami) {
    // Use the callback form so events get the same safe URL, title and
    // referrer handling as pageviews. The string form would attach the real
    // document title and external referrer to every event.
    window.umami.track((props) => ({
      ...props,
      url: safePath,
      title: safePath,
      referrer: '',
      name,
      ...(data ? { data } : {}),
    }));
    return;
  }
  queue.push({ kind: 'event', name, data, path: safePath });
}

export function initAnalytics(): void {
  if (
    started ||
    !analyticsConfigured() ||
    doNotTrackEnabled() ||
    typeof document === 'undefined'
  ) {
    return;
  }
  started = true;
  const script = document.createElement('script');
  script.defer = true;
  script.src = scriptUrl as string;
  script.dataset.websiteId = websiteId as string;
  // Keep the tracker initialized, but send pageviews ourselves so SPA route
  // changes and dynamic path segments stay under our control.
  script.dataset.autoPageview = 'false';
  script.dataset.excludeSearch = 'true';
  script.dataset.excludeHash = 'true';
  script.dataset.doNotTrack = 'true';
  script.onload = () => {
    const umami = window.umami;
    if (!umami) return;
    for (const event of queue.splice(0)) {
      if (event.kind === 'pageview') {
        umami.track((props) => ({
          ...props,
          url: event.path,
          title: event.path,
          referrer: '',
        }));
      } else {
        umami.track((props) => ({
          ...props,
          url: event.path,
          title: event.path,
          referrer: '',
          name: event.name,
          ...(event.data ? { data: event.data } : {}),
        }));
      }
    }
  };
  document.head.appendChild(script);
}
