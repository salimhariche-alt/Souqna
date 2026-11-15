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
  date_joined: string;
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

export function signupRequest(input: SignupInput) {
  return apiFetch<AuthResponse>('/api/auth/signup/', { method: 'POST', body: input });
}

export function loginRequest(phoneOrEmail: string, password: string) {
  return apiFetch<AuthResponse>('/api/auth/login/', {
    method: 'POST',
    body: { phone_or_email: phoneOrEmail, password },
  });
}

export function meRequest() {
  return apiFetch<User>('/api/auth/me/', { auth: true });
}
