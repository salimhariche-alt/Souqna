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
  phone_verified: boolean;
  phone_verified_at: string | null;
  items_sold: number;
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

/** The short code word the backend adds to verification errors, e.g. "wrong_code". */
export type VerificationErrorData = {
  detail?: string;
  code?: string;
  attempts_left?: number;
  retry_in?: number;
};
