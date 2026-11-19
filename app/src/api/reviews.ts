/**
 * Reviews (Step 5.1 G): after a delivered order, the buyer and the seller rate each
 * other (1-5 stars, a short comment). Shown on profiles and on the listing's seller card.
 */
import { apiFetch } from './client';
import type { Order } from './delivery';

/** {"average": 4.8, "count": 12} - average is null when nobody reviewed yet. */
export type Rating = { average: number | null; count: number };

export type PublicReview = {
  id: number;
  stars: number;
  comment: string;
  /** Who wrote it: the buyer (about the seller) or the seller (about the buyer). */
  role: 'buyer' | 'seller';
  author: { id: number; display_name: string };
  created_at: string;
};

export function postReview(orderId: number, stars: number, comment: string) {
  return apiFetch<Order>(`/api/orders/${orderId}/review/`, {
    method: 'POST',
    body: { stars, comment },
    auth: true,
  });
}

export function fetchUserReviews(userId: number, page = 1) {
  return apiFetch<{ count: number; next: string | null; results: PublicReview[] }>(
    `/api/users/${userId}/reviews/?page=${page}`,
  );
}
