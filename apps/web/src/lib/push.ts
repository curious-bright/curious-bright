import { apiFetchStrict, getAccessToken } from './api';

/**
 * Web Push registration flow. The backend exposes VAPID keys and stores the
 * subscription; everything here degrades silently when push is unavailable
 * (no SW support, permission denied, or push disabled server-side).
 */

function urlBase64ToApplicationServerKey(key: string): Uint8Array<ArrayBuffer> {
  const padded = key + '='.repeat((4 - (key.length % 4)) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function ensurePushSubscription(): Promise<boolean> {
  if (!pushSupported() || !getAccessToken()) return false;
  if (Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.ready;
  try {
    const { key } = await apiFetchStrict<{ key: string }>('/push/vapid-public-key/');
    if (!key) return false;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToApplicationServerKey(key),
      });
    }
    const json = subscription.toJSON();
    await apiFetchStrict('/push/web-subscriptions/', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      }),
    });
    return true;
  } catch {
    return false;
  }
}

/** Called from a user gesture (opt-in button); asks permission then subscribes. */
export async function enablePushNotifications(): Promise<NotificationPermission> {
  if (!pushSupported()) return 'denied';
  const permission = await Notification.requestPermission();
  if (permission === 'granted') await ensurePushSubscription();
  return permission;
}

export async function disablePushNotifications(): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => undefined);
  await apiFetchStrict('/push/web-subscriptions/', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  }).catch(() => undefined);
}

let listenersAttached = false;

function invalidateLocalCaches() {
  // No direct query-client access here; a lightweight event lets the app
  // (AppShell) refresh whatever it cares about when a push wakes it up.
  window.dispatchEvent(new CustomEvent('curious:push'));
}

export function attachPushClientListeners(): void {
  if (!pushSupported() || listenersAttached) return;
  listenersAttached = true;
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'navigate' && typeof data.href === 'string') {
      const path = data.href.startsWith('http') ? new URL(data.href).pathname : data.href;
      window.location.href = path;
    } else if (data.type === 'push-resubscribe') {
      void ensurePushSubscription();
    } else if (data.type === 'push-received') {
      invalidateLocalCaches();
    }
  });
  void ensurePushSubscription();
}
