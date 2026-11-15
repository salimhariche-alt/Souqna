/**
 * The backend writes its error messages in English. This file turns the ones we
 * know into translation keys, so they appear in French, Arabic or English.
 * Messages we don't recognise are shown as they are, so nothing is ever hidden.
 */
import type { TFunction } from 'i18next';

import { ApiError } from '@/api/client';

const KNOWN_MESSAGES: [RegExp, string][] = [
  [/^Enter a valid Algerian mobile number/, 'errors.phoneInvalid'],
  [/^This phone number is already registered/, 'errors.phoneTaken'],
  [/^This email is already registered/, 'errors.emailTaken'],
  [/^Enter a phone number or an email/, 'errors.phoneOrEmail'],
  [/^Enter a valid email address/, 'errors.emailInvalid'],
  [/^Please enter your name/, 'errors.nameRequired'],
  [/^(Please choose your wilaya|Choose a wilaya number)/, 'errors.wilayaRequired'],
  [/^Wrong phone number\/email or password/, 'errors.wrongCredentials'],
  [/^Enter your phone number or email/, 'errors.identifierRequired'],
  [/^Enter your password/, 'errors.passwordRequired'],
  [/password is too short/i, 'errors.passwordShort'],
  [/password is too common/i, 'errors.passwordCommon'],
  [/password is entirely numeric/i, 'errors.passwordNumeric'],
  [/password is too similar/i, 'errors.passwordSimilar'],
  [/^This field (is required|may not be blank)/, 'errors.required'],
];

export function translateApiMessage(message: string, t: TFunction): string {
  const throttled = /throttled.*?(\d+)\s*second/i.exec(message);
  if (throttled) return t('errors.throttled', { seconds: throttled[1] });
  for (const [pattern, key] of KNOWN_MESSAGES) {
    if (pattern.test(message)) return t(key);
  }
  return message;
}

export type FormErrors = { fields: Record<string, string>; general?: string };

/**
 * Turn any error into messages for a form.
 * `fieldMap` says which form field shows each backend field, e.g. { phone: 'identifier' }.
 */
export function formErrorsFrom(
  error: unknown,
  t: TFunction,
  fieldMap: Record<string, string> = {},
): FormErrors {
  if (!(error instanceof ApiError)) return { fields: {}, general: t('errors.unknown') };
  if (error.isNetworkError) return { fields: {}, general: t('errors.network') };

  const result: FormErrors = { fields: {} };
  const data = error.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const first = Array.isArray(value) ? value[0] : value;
      if (typeof first !== 'string') continue;
      const message = translateApiMessage(first, t);
      const field = fieldMap[key];
      if (field) {
        result.fields[field] ??= message; // keep the first message per field
      } else {
        result.general ??= message; // "detail", "non_field_errors", ...
      }
    }
  }
  if (!result.general && Object.keys(result.fields).length === 0) {
    result.general = t('errors.unknown');
  }
  return result;
}
