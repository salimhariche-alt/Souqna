/**
 * Which listings are in my favourites (for the hearts on Home), with add/remove.
 *
 * Loaded once when logged in (my favourites, up to 5 pages = 100), shared by every
 * screen, and updated at once when a heart is tapped (then saved on the server; if
 * that fails, the heart goes back).
 */
import { useCallback, useEffect, useState } from 'react';

import { addFavorite, fetchFavorites, removeFavorite } from '@/api/listings';
import { useAuth } from '@/auth/auth-provider';

const MAX_PAGES = 5;

let ids = new Set<number>();
let loadedFor: number | null = null; // the user the set belongs to
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

async function loadAll(userId: number) {
  const found = new Set<number>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchFavorites(page);
    result.results.forEach((listing) => found.add(listing.id));
    if (!result.next) break;
  }
  if (loadedFor === userId) {
    ids = found;
    notify();
  }
}

export function useFavoriteIds() {
  const { user } = useAuth();
  const [, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (userId === loadedFor) return;
    loadedFor = userId;
    ids = new Set();
    notify();
    if (userId !== null) loadAll(userId).catch(() => {});
  }, [user?.id]);

  const toggle = useCallback(async (listingId: number) => {
    const wasLiked = ids.has(listingId);
    ids = new Set(ids);
    if (wasLiked) ids.delete(listingId);
    else ids.add(listingId);
    notify();
    try {
      if (wasLiked) await removeFavorite(listingId);
      else await addFavorite(listingId);
    } catch {
      ids = new Set(ids);
      if (wasLiked) ids.add(listingId);
      else ids.delete(listingId);
      notify();
    }
  }, []);

  return { isFavorite: (id: number) => ids.has(id), toggle };
}
