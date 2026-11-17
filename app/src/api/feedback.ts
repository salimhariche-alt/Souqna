import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import type { Language } from '@/i18n';

import { apiFetch } from './client';

/**
 * "Send feedback" (Profile tab): a message and an optional screenshot (a photo file,
 * already resized). The server removes hidden data from the picture.
 */
export async function sendFeedbackRequest(
  message: string,
  language: Language,
  screenshotUri?: string | null,
) {
  const form = new FormData();
  form.append('message', message);
  form.append('platform', Platform.OS === 'web' ? 'web' : Platform.OS);
  form.append('language', language);
  if (screenshotUri) {
    if (Platform.OS === 'web') {
      const blob = await (await fetch(screenshotUri)).blob();
      form.append('screenshot', blob, 'screenshot.jpg');
    } else {
      // Expo's fetch (SDK 58) needs a part that can give its bytes (see uploadListingPhoto).
      const file = new File(screenshotUri);
      const part = { name: 'screenshot.jpg', type: 'image/jpeg', bytes: () => file.bytes() };
      form.append('screenshot', part as unknown as Blob);
    }
  }
  return apiFetch<{ id: number }>('/api/feedback/', {
    method: 'POST',
    form,
    auth: true,
    timeoutMs: 60000,
  });
}
