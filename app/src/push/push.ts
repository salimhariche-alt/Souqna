/**
 * Push notifications (Step 5.1 I): new orders, confirmations, delivery news, messages
 * and offers. The server decides what to send (in the user's language, never the words
 * of a message); this file asks the phone's permission and gives the server this
 * phone's push address.
 *
 * Expo Go on Android can't receive push notifications (Expo removed it): there,
 * pushSupport() says 'expo-go' and only the installed app (APK) gets them.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { apiFetch } from '@/api/client';

const TOKEN_KEY = 'souqna.pushToken';

export type PushSupport = 'ok' | 'web' | 'simulator' | 'expo-go';
export type PushPermission = 'granted' | 'denied' | 'undetermined';
export type PushSettings = { orders: boolean; messages: boolean };

export function pushSupport(): PushSupport {
  if (Platform.OS === 'web') return 'web';
  if (!Device.isDevice) return 'simulator';
  if (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return 'expo-go';
  }
  return 'ok';
}

export async function pushPermission(): Promise<PushPermission> {
  if (pushSupport() !== 'ok') return 'undetermined';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
}

/**
 * Give the server this phone's push address. With `ask`, the phone's permission
 * question is shown first if needed (only after our own explanation!).
 * Returns the permission in the end.
 */
export async function registerForPush(ask: boolean): Promise<PushPermission> {
  if (pushSupport() !== 'ok') return 'undetermined';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Sougna',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#B4472A',
    });
  }
  let permission = await pushPermission();
  if (permission !== 'granted' && ask) {
    const { status } = await Notifications.requestPermissionsAsync();
    permission = status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
  }
  if (permission !== 'granted') return permission;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await apiFetch('/api/push/devices/', {
    method: 'POST',
    body: { token, platform: Platform.OS },
    auth: true,
  });
  await AsyncStorage.setItem(TOKEN_KEY, token);
  return permission;
}

/** On log out: this phone gets no more alerts for this account (best effort). */
export async function unregisterPush() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await apiFetch('/api/push/devices/', { method: 'DELETE', body: { token }, auth: true });
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // Offline: the server forgets the phone when another account logs in on it.
  }
}

export function fetchPushSettings() {
  return apiFetch<PushSettings>('/api/push/settings/', { auth: true });
}

export function updatePushSettings(changes: Partial<PushSettings>) {
  return apiFetch<PushSettings>('/api/push/settings/', { method: 'PATCH', body: changes, auth: true });
}
