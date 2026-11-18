/**
 * The number of unread notifications (the dot on Home's bell), shared by every screen.
 * refreshNotificationsUnread() asks the server; the bell updates by itself.
 */
import { useSyncExternalStore } from 'react';

import { fetchNotificationsUnread } from '@/api/delivery';

let count = 0;
const listeners = new Set<() => void>();

export function setNotificationsUnread(value: number) {
  if (value === count) return;
  count = value;
  listeners.forEach((listener) => listener());
}

export async function refreshNotificationsUnread() {
  try {
    setNotificationsUnread(await fetchNotificationsUnread());
  } catch {
    // No connection or logged out: keep the last number.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNotificationsUnread() {
  return useSyncExternalStore(subscribe, () => count, () => count);
}
