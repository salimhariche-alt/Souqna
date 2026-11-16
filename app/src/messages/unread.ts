/**
 * The total number of unread messages, shared by the tab badge and the screens.
 * Any screen can call refreshUnread() after reading messages; the badge updates.
 */
import { useSyncExternalStore } from 'react';

import { fetchUnreadCount } from '@/api/conversations';

let count = 0;
const listeners = new Set<() => void>();

export function setUnread(value: number) {
  if (value === count) return;
  count = value;
  listeners.forEach((listener) => listener());
}

export async function refreshUnread() {
  try {
    setUnread(await fetchUnreadCount());
  } catch {
    // No connection: keep the last number; the next check will try again.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUnreadCount() {
  return useSyncExternalStore(subscribe, () => count, () => count);
}
