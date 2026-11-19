/**
 * Delivery between wilayas (Step 5.1): communes, relay points, price estimate, orders
 * (the buyer taps "Acheter" and collects at a relay point), notifications.
 * Cash on delivery: the amounts are only recorded - Sougna doesn't handle money yet.
 */
import { apiFetch } from './client';

export type Commune = { code: number; wilaya: number; name_fr: string; name_ar: string };

export type DeliveryMode = 'home' | 'stop_desk';

export const ORDER_STEPS = ['created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'] as const;
export type OrderStatus = (typeof ORDER_STEPS)[number] | 'returned' | 'cancelled';

export type Quote = {
  provider: string;
  /** Seller and buyer in the same wilaya: drop-off and pick-up at the same office, free delivery. */
  same_wilaya: boolean;
  item_price_dzd: number;
  delivery_price_dzd: number;
  buyer_fee_dzd: number;
  total_dzd: number;
  days_min: number;
  days_max: number;
  stop_desk_name: string;
};

export type Order = {
  id: number;
  conversation: number;
  listing: { id: number; title: string; cover_photo: string | null };
  provider: string;
  mode: DeliveryMode;
  origin_wilaya: number;
  wilaya: number;
  commune: Commune;
  /** The relay point (courier's office) where the buyer collects the parcel. */
  relay_point_id: string;
  stop_desk_name: string;
  relay_point_address: string;
  /** Empty for the seller: only the buyer and the courier see them. */
  recipient_name: string;
  recipient_phone: string;
  item_price_dzd: number;
  delivery_price_dzd: number;
  buyer_fee_dzd: number;
  total_to_pay_dzd: number;
  tracking_number: string;
  status: OrderStatus;
  events: { status: OrderStatus; note: string; created_at: string }[];
  i_am: 'buyer' | 'seller';
  other_person: { id: number; display_name: string };
  can_cancel: boolean;
  created_at: string;
};

/** "Acheter": what the buyer sends. */
export type CheckoutRequest = {
  listing: number;
  wilaya: number;
  relay_point: string;
  recipient_name: string;
  recipient_phone: string;
};

/** A courier's office where buyers collect parcels. Days: 0 = Monday ... 6 = Sunday. */
export type RelayPoint = {
  id: string;
  name: string;
  address: string;
  wilaya: number;
  commune: { code: number; name_fr: string; name_ar: string };
  latitude: number;
  longitude: number;
  open_days: number[];
  opens: string;
  closes: string;
  phone: string;
};

export type AppNotification = {
  id: number;
  kind: 'order_status';
  order: number | null;
  status: OrderStatus;
  listing_title: string;
  read: boolean;
  created_at: string;
};

type Page<T> = { count: number; next: string | null; results: T[] };

const communeCache = new Map<number, Commune[]>();

/** The communes of one wilaya (kept in memory: they never change). */
export async function fetchCommunes(wilaya: number): Promise<Commune[]> {
  const cached = communeCache.get(wilaya);
  if (cached) return cached;
  const communes = await apiFetch<Commune[]>(`/api/communes/?wilaya=${wilaya}`);
  communeCache.set(wilaya, communes);
  return communes;
}

/** Listing page: delivery to a wilaya (pick-up at the courier's office), fee and total. */
export type Estimate = Omit<Quote, 'stop_desk_name'> & { wilaya: number };

export function fetchEstimate(listing: number, wilaya: number) {
  const params = new URLSearchParams({ listing: String(listing), wilaya: String(wilaya) });
  return apiFetch<Estimate>(`/api/delivery/estimate/?${params}`);
}

/**
 * The relay points of a wilaya, the buyer's commune first. Sorting by distance is done
 * on the phone (see sortByDistance), so the phone's position is never sent anywhere.
 */
export function fetchRelayPoints(wilaya: number, commune?: number | null) {
  const params = new URLSearchParams({ wilaya: String(wilaya) });
  if (commune) params.set('commune', String(commune));
  return apiFetch<RelayPoint[]>(`/api/delivery/relay-points/?${params}`);
}

/** Straight-line distance in km (haversine). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (x: number) => (x * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export function sortByDistance(points: RelayPoint[], lat: number, lng: number) {
  return points
    .map((point) => ({ point, km: distanceKm(lat, lng, point.latitude, point.longitude) }))
    .sort((a, b) => a.km - b.km);
}

export function createOrder(request: CheckoutRequest) {
  return apiFetch<Order>('/api/orders/', { method: 'POST', body: request, auth: true });
}

export function fetchOrder(id: number | string) {
  return apiFetch<Order>(`/api/orders/${id}/`, { auth: true });
}

export function fetchOrders(page = 1) {
  return apiFetch<Page<Order>>(`/api/orders/?page=${page}`, { auth: true });
}

/** The delivery for this conversation, if there is one (the newest). */
export async function fetchOrderForConversation(conversation: number): Promise<Order | null> {
  const data = await apiFetch<Page<Order>>(`/api/orders/?conversation=${conversation}`, { auth: true });
  return data.results[0] ?? null;
}

/** My active (or latest) order for a listing, if any - the listing page shows "Suivre". */
export async function fetchMyOrderForListing(listing: number): Promise<Order | null> {
  const data = await apiFetch<Page<Order>>(`/api/orders/?listing=${listing}`, { auth: true });
  return data.results.find((order) => order.i_am === 'buyer') ?? null;
}

export function cancelOrder(id: number) {
  return apiFetch<Order>(`/api/orders/${id}/cancel/`, { method: 'POST', auth: true });
}

export function fetchNotifications(page = 1) {
  return apiFetch<Page<AppNotification>>(`/api/notifications/?page=${page}`, { auth: true });
}

export async function fetchNotificationsUnread(): Promise<number> {
  return (await apiFetch<{ unread: number }>('/api/notifications/unread-count/', { auth: true })).unread;
}

export function markNotificationsRead() {
  return apiFetch<{ unread: number }>('/api/notifications/read/', { method: 'POST', auth: true });
}
