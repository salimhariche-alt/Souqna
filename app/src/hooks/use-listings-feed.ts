import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchListings,
  type ListingFilters,
  type ListingsPage,
  type ListingSummary,
} from '@/api/listings';

export type FeedStatus = 'loading' | 'ready' | 'error';

/**
 * A list of active listings, newest first, 20 at a time (used by Home and Search).
 *
 * - loadMore(): add the next page (call it when the user scrolls near the bottom)
 * - refresh():  reload from page 1 (pull down to refresh)
 * - retry():    try the first page again after an error
 * - count:      how many listings match in total (e.g. "45 articles")
 * Changing any filter starts again from page 1.
 *
 * `fetchPage` loads something else page by page (e.g. my favourites) instead of the
 * active listings; it must stay the same function between renders.
 */
export function useListingsFeed(
  filters: ListingFilters,
  fetchPage?: (page: number) => Promise<ListingsPage>,
) {
  const [items, setItems] = useState<ListingSummary[]>([]);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<FeedStatus>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);

  // The filters as text, so a new object with the same values doesn't reload.
  const filtersKey = JSON.stringify(filters);
  const currentFilters = useMemo(() => JSON.parse(filtersKey) as ListingFilters, [filtersKey]);
  const load = useCallback(
    (page: number) => (fetchPage ? fetchPage(page) : fetchListings({ page, filters: currentFilters })),
    [fetchPage, currentFilters],
  );

  // Kept in refs so that quick repeated scroll events see the latest values.
  const page = useRef(0);
  const hasMore = useRef(false);
  const busyLoadingMore = useRef(false);
  // Each new first-page load gets a number; answers for older loads are ignored
  // (e.g. the user kept typing, or changed a filter before the last search finished).
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
        const data = await load(1);
        if (myGeneration !== generation.current) return;
        page.current = 1;
        hasMore.current = data.next !== null;
        setItems(data.results);
        setCount(data.count);
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
    [load],
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
      const data = await load(nextPage);
      if (myGeneration !== generation.current) return;
      page.current = nextPage;
      hasMore.current = data.next !== null;
      setCount(data.count);
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
  }, [status, load]);

  return {
    items,
    count,
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

export type ListingsFeed = ReturnType<typeof useListingsFeed>;
