/**
 * Privacy-first Umami integration. Only route names and coarse product events
 * are sent; message bodies, email addresses, search queries and other personal
 * data must never be passed to `track`.
 */
type EventData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: {
      track: (name: string, data?: EventData) => void;
    };
  }
}

const scriptUrl = import.meta.env.VITE_UMAMI_SCRIPT_URL as string | undefined;
const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID as string | undefined;
let started = false;
const queue: Array<{ name: string; data?: EventData }> = [];

export function track(name: string, data?: EventData): void {
  if (!scriptUrl || !websiteId) return;
  if (window.umami) {
    window.umami.track(name, data);
    return;
  }
  queue.push({ name, data });
}

export function initAnalytics(): void {
  if (started || !scriptUrl || !websiteId || typeof document === 'undefined') return;
  started = true;
  const script = document.createElement('script');
  script.defer = true;
  script.src = scriptUrl;
  script.dataset.websiteId = websiteId;
  script.dataset.autoTrack = 'false';
  script.onload = () => {
    for (const event of queue.splice(0)) {
      window.umami?.track(event.name, event.data);
    }
  };
  document.head.appendChild(script);
}
