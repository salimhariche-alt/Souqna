/**
 * Where the app finds the Django backend. This is the only place to change it.
 *
 * By default (BACKEND_URL_OVERRIDE = null) the app uses the same computer that runs
 * `npx expo start`, on port 8000:
 *   - phone with Expo Go -> http://<your laptop's Wi-Fi address>:8000
 *   - web browser        -> http://<the address in the browser bar>:8000
 * So when your laptop's Wi-Fi address changes, nothing needs editing here.
 *
 * To use a fixed address instead, set it below, for example:
 *   const BACKEND_URL_OVERRIDE = 'http://192.168.1.20:8000';
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const BACKEND_URL_OVERRIDE: string | null = null;
const BACKEND_PORT = 8000;

function computerRunningExpo(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.hostname;
  }
  // While developing, Expo tells the app where its dev server is, e.g. "10.0.0.5:8081".
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    return hostUri.split(':')[0];
  }
  return 'localhost';
}

export const API_URL = (
  BACKEND_URL_OVERRIDE ?? `http://${computerRunningExpo()}:${BACKEND_PORT}`
).replace(/\/+$/, '');
