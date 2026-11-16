/**
 * A private random ID for this app installation, created once and kept on the device.
 *
 * It is sent with sign up and log in so the backend can spot one device creating many
 * accounts (a common scammer trick). It says nothing about the person or the phone:
 * it's just a random number, and a new one is made if the app is reinstalled.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';

const KEY = 'souqna.deviceId';
let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved) return (cached = saved);
  } catch {
    // storage not available: fall through and make one for this session
  }
  const fresh = randomUUID();
  cached = fresh;
  AsyncStorage.setItem(KEY, fresh).catch(() => {});
  return fresh;
}
