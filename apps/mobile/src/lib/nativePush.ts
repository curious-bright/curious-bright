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

export function attachNotificationResponseListener(onOpen: (route: string) => void): void {
  if (!Notifications || responseListenerAttached) return;
  responseListenerAttached = true;
  Notifications.addNotificationResponseReceivedListener((response) => {
    const route = hrefToRoute(
      response.notification.request.content.data?.href as string | undefined
    );
    if (route) onOpen(route);
  });
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
  if (!Notifications || !Device.isDevice) return false;

  await ensureAndroidChannel();

  const permission = await Notifications.getPermissionsAsync();
  let status = permission.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return false;

  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    if (!token) return false;
    return apiVoid('/push/expo-tokens/', {
      method: 'POST',
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
  } catch {
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
