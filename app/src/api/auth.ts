import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { getDeviceId } from '@/auth/device-id';
import type { Language } from '@/i18n';

import { apiFetch } from './client';

/** The logged-in user, as returned by /api/auth/me/. */
export type User = {
  id: number;
  phone: string | null;
  email: string | null;
  display_name: string;
  wilaya: number | null;
  wilaya_name: string;
  preferred_language: Language;
  /** Profile photo address, or null. */
  avatar: string | null;
  phone_verified: boolean;
  phone_verified_at: string | null;
  items_sold: number;
  /** Already saw the "Buy safely" tips (shown once, before the first conversation). */
  safety_tips_seen: boolean;
  date_joined: string;
};

/** Where the user is in phone verification (GET /api/auth/phone/status/). */
export type PhoneStatus = {
  phone_verified: boolean;
  /** The number the code goes to (null if the account has no phone yet). */
  phone: string | null;
  code_expires_in: number;
  resend_in: number;
  locked_for: number;
};

export type AuthResponse = { user: User; access: string; refresh: string };

export type SignupInput = {
  phone?: string;
  email?: string;
  password: string;
  display_name: string;
  wilaya: number;
  preferred_language: Language;
};

export async function signupRequest(input: SignupInput) {
  const device_id = await getDeviceId();
  return apiFetch<AuthResponse>('/api/auth/signup/', {
    method: 'POST',
    body: { ...input, device_id },
  });
}

export async function loginRequest(phoneOrEmail: string, password: string) {
  const device_id = await getDeviceId();
  return apiFetch<AuthResponse>('/api/auth/login/', {
    method: 'POST',
    body: { phone_or_email: phoneOrEmail, password, device_id },
  });
}

export function meRequest() {
  return apiFetch<User>('/api/auth/me/', { auth: true });
}

export function phoneStatusRequest() {
  return apiFetch<PhoneStatus>('/api/auth/phone/status/', { auth: true });
}

/** Send a 6-digit code by SMS. `phone` only for accounts that don't have one yet. */
export function sendPhoneCodeRequest(phone?: string) {
  return apiFetch<PhoneStatus>('/api/auth/phone/send-code/', {
    method: 'POST',
    body: phone ? { phone } : {},
    auth: true,
  });
}

export function verifyPhoneCodeRequest(code: string) {
  return apiFetch<{ user: User }>('/api/auth/phone/verify/', {
    method: 'POST',
    body: { code },
    auth: true,
  });
}

/** Change my display name and/or wilaya. */
export function updateProfileRequest(changes: { display_name?: string; wilaya?: number }) {
  return apiFetch<User>('/api/auth/me/', { method: 'PATCH', body: changes, auth: true });
}

/** Set my profile photo (a resized photo file). The server removes hidden data. */
export async function uploadAvatarRequest(fileUri: string) {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(fileUri)).blob();
    form.append('image', blob, 'avatar.jpg');
  } else {
    // Expo's fetch (SDK 58) needs a part that can give its bytes (see uploadListingPhoto).
    const file = new File(fileUri);
    const part = { name: 'avatar.jpg', type: 'image/jpeg', bytes: () => file.bytes() };
    form.append('image', part as unknown as Blob);
  }
  return apiFetch<{ user: User }>('/api/auth/me/avatar/', {
    method: 'POST',
    form,
    auth: true,
    timeoutMs: 60000,
  });
}

export function removeAvatarRequest() {
  return apiFetch<{ user: User }>('/api/auth/me/avatar/', { method: 'DELETE', auth: true });
}

/** Delete my account. `confirm` = my phone number (or email if I have no phone). */
export function deleteAccountRequest(confirm: string) {
  return apiFetch<null>('/api/auth/delete-account/', {
    method: 'POST',
    body: { confirm },
    auth: true,
  });
}

/** A seller's public profile (never their phone or email). */
export type PublicProfile = {
  id: number;
  display_name: string;
  wilaya: number | null;
  avatar: string | null;
  phone_verified: boolean;
  member_since: string;
  items_sold: number;
  active_listings: number;
};

/** Members whose name contains the words (at least 2 letters, at most 10 results). */
export function searchMembers(query: string) {
  return apiFetch<PublicProfile[]>(`/api/users/?search=${encodeURIComponent(query)}`);
}

export function fetchPublicProfile(userId: number | string) {
  return apiFetch<PublicProfile>(`/api/users/${userId}/`, { auth: true });
}

/** The short code word the backend adds to verification errors, e.g. "wrong_code". */
export type VerificationErrorData = {
  detail?: string;
  code?: string;
  attempts_left?: number;
  retry_in?: number;
};
