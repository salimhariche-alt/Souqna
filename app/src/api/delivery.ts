/**
 * Delivery between wilayas (Step 5.1): communes, price estimate, orders, notifications.
 * Cash on delivery: the amounts are only recorded - Sougna doesn't handle money yet.
 */
import { apiFetch } from './client';

export type Commune = { code: number; wilaya: number; name_fr: string; name_ar: string };

export type DeliveryMode = 'home' | 'stop_desk';

export const ORDER_STEPS = ['created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'] as const;
export type OrderStatus = (typeof ORDER_STEPS)[number] | 'returned' | 'cancelled';

export type Quote = {
  provider: string;
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
  address: string;
  stop_desk_name: string;
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

export type DeliveryRequest = {
  conversation: number;
  mode: DeliveryMode;
  wilaya: number;
  commune: number;
  address: string;
  recipient_name: string;
  recipient_phone: string;
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

export function fetchQuote(conversation: number, mode: DeliveryMode, wilaya: number, commune: number) {
  const params = new URLSearchParams({
    conversation: String(conversation),
    mode,
    wilaya: String(wilaya),
    commune: String(commune),
  });
  return apiFetch<Quote>(`/api/delivery/quote/?${params}`, { auth: true });
}

export function createOrder(request: DeliveryRequest) {
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
