/**
 * Where the login tokens are kept between app launches.
 *
 * Phone: expo-secure-store (encrypted: Android Keystore / iOS Keychain).
 * Web browser: secure storage doesn't exist there, so we fall back to the
 * browser's localStorage. That's fine for testing; the real app runs on phones.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_KEY = 'souqna.access';
const REFRESH_KEY = 'souqna.refresh';
const USER_KEY = 'souqna.user';

const isWeb = Platform.OS === 'web';

async function getItem(key: string): Promise<string | null> {
  try {
    if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  try {
    if (isWeb) globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // nothing to delete
  }
}

export const tokenStorage = {
  getAccess: () => getItem(ACCESS_KEY),
  getRefresh: () => getItem(REFRESH_KEY),
  setAccess: (token: string) => setItem(ACCESS_KEY, token),

  async saveTokens(access: string, refresh: string) {
    await setItem(ACCESS_KEY, access);
    await setItem(REFRESH_KEY, refresh);
  },

  /** A copy of the user's profile, so the app can open while offline. */
  async getUser<T>(): Promise<T | null> {
    const raw = await getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  saveUser: (user: unknown) => setItem(USER_KEY, JSON.stringify(user)),

  async clear() {
    await Promise.all([deleteItem(ACCESS_KEY), deleteItem(REFRESH_KEY), deleteItem(USER_KEY)]);
  },
};
