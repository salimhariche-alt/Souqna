import { router, type Href } from 'expo-router';

/** The tabs that need a login. After logging in, the user is sent back to one of these. */
export const PROTECTED_TABS = ['/sell', '/messages', '/profile'] as const;

const LISTING_PAGE = /^\/listing\/\d+$/;

/**
 * Only accept a known place to return to after logging in: a protected tab, or a
 * listing's page (e.g. "/listing/61"). Anything else is ignored.
 */
export function safeNext(next: string | string[] | undefined): string | undefined {
  const value = Array.isArray(next) ? next[0] : next;
  if (value && LISTING_PAGE.test(value)) return value;
  return PROTECTED_TABS.find((tab) => tab === value);
}

/** Close the Log in / Sign up screen and go to `next` (or back to where the user was). */
export function leaveAuthScreen(next: string | undefined) {
  if (router.canGoBack()) {
    router.back();
    // A tab has to be switched to; a listing page is already right underneath.
    const isTab = PROTECTED_TABS.some((tab) => tab === next);
    if (next && isTab) router.navigate(next as Href);
  } else {
    router.replace((next ?? '/') as Href);
  }
}

/** Same tidy-up as the backend: "05 55-12.34.56" or "+213 555..." -> "0555123456". */
export function normalizePhone(value: string) {
  let phone = value.replace(/[\s\-.()]/g, '');
  if (phone.startsWith('+213')) phone = '0' + phone.slice(4);
  else if (phone.startsWith('00213')) phone = '0' + phone.slice(5);
  return phone;
}

export const ALGERIAN_MOBILE = /^0[567]\d{8}$/;
export const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
