/**
 * "Faire une offre" (Step 5.1 F): the buyer offers a lower price in the chat; if the
 * seller accepts, the buyer can buy at that price for 48 hours (only them).
 * The offers appear in the chat as messages (kind "offer").
 */
import { apiFetch } from './client';

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'used' | 'expired';
export type OfferEvent = 'made' | 'accepted' | 'declined' | 'withdrawn';

/** The offer as it is now (sent with every offer message). */
export type Offer = {
  id: number;
  amount_dzd: number;
  list_price_dzd: number;
  status: OfferStatus;
  valid_until: string | null;
};

/** In a chat message: the offer, and what this message says happened. */
export type OfferInMessage = Offer & { event: OfferEvent };

type Answer = { offer: Offer };

export function makeOffer(conversation: number, amount: number) {
  return apiFetch<Answer>('/api/offers/', {
    method: 'POST',
    body: { conversation, amount_dzd: amount },
    auth: true,
  });
}

export function acceptOffer(id: number) {
  return apiFetch<Answer>(`/api/offers/${id}/accept/`, { method: 'POST', auth: true });
}

export function declineOffer(id: number) {
  return apiFetch<Answer>(`/api/offers/${id}/decline/`, { method: 'POST', auth: true });
}

export function withdrawOffer(id: number) {
  return apiFetch<Answer>(`/api/offers/${id}/withdraw/`, { method: 'POST', auth: true });
}

/** The lowest offer the server accepts: half the price, rounded up to 10 DA. */
export function minOffer(price: number) {
  return Math.ceil((price * 0.5) / 10) * 10;
}

/** "-14 %" next to an offer. */
export function discountPercent(amount: number, price: number) {
  return price > 0 ? Math.round(((price - amount) / price) * 100) : 0;
}
