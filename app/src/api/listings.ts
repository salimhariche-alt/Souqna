import { API_URL } from '@/config';

const TIMEOUT_MS = 8000;

/** How many listings are currently active (for sale) on the backend. */
export async function fetchActiveListingsCount(): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}/api/listings/`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Server answered ${response.status}`);
    }
    const data: { count: number } = await response.json();
    return data.count;
  } finally {
    clearTimeout(timer);
  }
}
