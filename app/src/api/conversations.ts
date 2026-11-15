import { apiFetch } from './client';

/** My conversation about this listing, if I already have one (its id), else null. */
export async function findConversationForListing(listingId: number): Promise<number | null> {
  const data = await apiFetch<{ results: { id: number }[] }>(
    `/api/conversations/?listing=${listingId}`,
    { auth: true },
  );
  return data.results[0]?.id ?? null;
}

/**
 * Ask the seller about a listing: sends the first message. If a conversation about
 * this listing already exists, the backend adds the message to it instead.
 */
export function startConversation(listingId: number, text: string) {
  return apiFetch<{ id: number }>('/api/conversations/', {
    method: 'POST',
    body: { listing: listingId, text },
    auth: true,
  });
}
