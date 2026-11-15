import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchListings, type ListingSummary } from '@/api/listings';

export type FeedStatus = 'loading' | 'ready' | 'error';

/**
 * The Home feed: active listings, newest first, 20 at a time.
 *
 * - loadMore(): add the next page (call it when the user scrolls near the bottom)
 * - refresh():  reload from page 1 (pull down to refresh)
 * - retry():    try the first page again after an error
 * Changing `categoryId` starts again from page 1.
 */
export function useListingsFeed(categoryId: number | null) {
  const [items, setItems] = useState<ListingSummary[]>([]);
  const [status, setStatus] = useState<FeedStatus>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);

  // Kept in refs so that quick repeated scroll events see the latest values.
  const page = useRef(0);
  const hasMore = useRef(false);
  const busyLoadingMore = useRef(false);
  // Each new first-page load gets a number; answers for older loads are ignored
  // (e.g. the user tapped another category before the first one finished).
  const generation = useRef(0);

  const loadFirstPage = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const myGeneration = ++generation.current;
      busyLoadingMore.current = false;
      setLoadingMore(false);
      setLoadMoreFailed(false);
      setRefreshFailed(false);
      if (mode === 'initial') {
        setStatus('loading');
        setItems([]);
      } else {
        setRefreshing(true);
      }
      try {
        const data = await fetchListings({ page: 1, category: categoryId });
        if (myGeneration !== generation.current) return;
        page.current = 1;
        hasMore.current = data.next !== null;
        setItems(data.results);
        setStatus('ready');
      } catch {
        if (myGeneration !== generation.current) return;
        if (mode === 'initial') {
          setStatus('error');
        } else {
          setRefreshFailed(true); // keep showing the listings we already have
        }
      } finally {
        if (myGeneration === generation.current) setRefreshing(false);
      }
    },
    [categoryId],
  );

  useEffect(() => {
    loadFirstPage('initial');
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (status !== 'ready' || !hasMore.current || busyLoadingMore.current) return;
    const myGeneration = generation.current;
    busyLoadingMore.current = true;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    try {
      const nextPage = page.current + 1;
      const data = await fetchListings({ page: nextPage, category: categoryId });
      if (myGeneration !== generation.current) return;
      page.current = nextPage;
      hasMore.current = data.next !== null;
      // New listings posted meanwhile shift the pages; skip ones we already show.
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...data.results.filter((item) => !seen.has(item.id))];
      });
    } catch {
      if (myGeneration === generation.current) setLoadMoreFailed(true);
    } finally {
      if (myGeneration === generation.current) {
        busyLoadingMore.current = false;
        setLoadingMore(false);
      }
    }
  }, [status, categoryId]);

  return {
    items,
    status,
    refreshing,
    refreshFailed,
    loadingMore,
    loadMoreFailed,
    loadMore,
    refresh: () => loadFirstPage('refresh'),
    retry: () => loadFirstPage('initial'),
  };
}
