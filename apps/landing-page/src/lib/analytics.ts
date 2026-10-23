/**
 * Privacy-first analytics for the public landing page (Umami).
 *
 * Only coarse page names and product events are sent. Never pass names, email
 * addresses, search terms, plan custom text or any other personal data.
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
