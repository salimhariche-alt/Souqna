import { apiFetch } from './client';

/** How many listings are currently active (for sale) on the backend. */
export async function fetchActiveListingsCount(): Promise<number> {
  const data = await apiFetch<{ count: number }>('/api/listings/');
  return data.count;
}
