// Native push registration (Expo push notification service -> FCM on Android).
// Silent-skip friendly: every failure path just disables push for the session.

import { Platform } from 'react-native';

import { apiVoid } from './api';

// expo-notifications/expo-device are native modules and are not exported from
// browser bundles; the web client uses Web Push instead.
const nativePlatform = Platform.OS === 'android' || Platform.OS === 'ios';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Notifications = nativePlatform
  ? (require('expo-notifications') as typeof import('expo-notifications'))
  : null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Device = nativePlatform
  ? (require('expo-device') as typeof import('expo-device'))
  : ({ isDevice: false } as unknown as typeof import('expo-device'));

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

function devLog(message: string): void {
  if (__DEV__) console.log(`[push] ${message}`);
}

function devWarn(message: string): void {
  if (__DEV__) console.warn(`[push] ${message}`);
}

// Backend hrefs -> mobile routes.
const HREF_ROUTES: Record<string, string> = {
  '/notifications': '/inbox',
};

function hrefToRoute(href: string | undefined): string | null {
  if (!href) return null;
  const message = /^\/messages\/(\d+)$/.exec(href);
  if (message) return `/chat/${message[1]}`;
  return HREF_ROUTES[href] ?? href;
}

let responseListenerAttached = false;
let handledResponseId: string | null = null;

function openResponse(
  response: import('expo-notifications').NotificationResponse,
  onOpen: (route: string) => void,
): void {
  const id = `${response.notification.request.identifier}:${response.notification.date}`;
  if (handledResponseId === id) return;
  handledResponseId = id;
  const route = hrefToRoute(response.notification.request.content.data?.href as string | undefined);
  if (route) onOpen(route);
}

export function attachNotificationResponseListener(onOpen: (route: string) => void): void {
  if (!Notifications || responseListenerAttached) return;
  responseListenerAttached = true;
  Notifications.addNotificationResponseReceivedListener((response) => openResponse(response, onOpen));
  // A tap that cold-started the app fires no listener — the response is only
  // readable from the launch snapshot.
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) openResponse(response, onOpen);
    })
    .catch(() => {});
}

export function isPushCapable(): boolean {
  return nativePlatform && Device.isDevice;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android' || !Notifications) return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Activity',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF5A36',
  });
}

/**
 * Ask permission, obtain the Expo push token and register it with the
 * backend. Returns true when the token was stored.
 */
export async function registerForPushNotifications(): Promise<boolean> {
  if (!Notifications) return false;
  if (!Device.isDevice) {
    devWarn('skipped: not a physical device (Expo Go / simulator)');
    return false;
  }

  await ensureAndroidChannel();

  const permission = await Notifications.getPermissionsAsync();
  let status = permission.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    devWarn('skipped: notification permission denied');
    return false;
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    if (!token) {
      devWarn('skipped: empty Expo push token');
      return false;
    }
    const stored = await apiVoid('/push/expo-tokens/', {
      method: 'POST',
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
    devLog(`registered push token ${token.slice(0, 18)}… -> ${stored ? 'ok' : 'backend rejected'}`);
    return stored;
  } catch (err) {
    // Usually FCM unavailable: wrong/outdated google-services.json, no Play
    // services, or the build is not linked to this Expo project.
    devWarn(`token request failed: ${(err as Error)?.message ?? err}`);
    return false;
  }
}

export async function unregisterPushToken(): Promise<void> {
  if (!Notifications) return;
  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    if (token) {
      await apiVoid('/push/expo-tokens/', {
        method: 'DELETE',
        body: JSON.stringify({ token }),
      });
    }
  } catch {
    // Server-side pruning (DeviceNotRegistered) is the fallback.
  }
}
