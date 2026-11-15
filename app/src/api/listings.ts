import { ApiError, apiFetch } from './client';

/** One listing in a list (the short version sent by GET /api/listings/). */
export type ListingSummary = {
  id: number;
  title: string;
  price_dzd: number;
  category: number;
  category_name: string;
  size: string;
  brand: string;
  condition: string;
  condition_label: string;
  wilaya: number;
  wilaya_name: string;
  status: 'active' | 'reserved' | 'sold';
  cover_photo: string | null;
  created_at: string;
};

/** One page of results, 20 listings per page. */
export type ListingsPage = {
  count: number;
  next: string | null;
  previous: string | null;
  results: ListingSummary[];
};

export type Category = {
  id: number;
  name_ar: string;
  name_fr: string;
  name_en: string;
  parent: number | null;
};

/** One listing with everything (GET /api/listings/{id}/). */
export type ListingDetail = Omit<ListingSummary, 'cover_photo'> & {
  description: string;
  seller: { id: number; display_name: string; wilaya: number | null };
  photos: { id: number; image: string; position: number }[];
  /** True if it's in the logged-in user's favorites (always false when logged out). */
  is_favorited: boolean;
};

/** One listing. With `auth`, the answer also says whether it's in my favorites. */
export function fetchListing(id: number | string, auth: boolean) {
  return apiFetch<ListingDetail>(`/api/listings/${id}/`, { auth });
}

export function addFavorite(listingId: number) {
  return apiFetch<unknown>(`/api/listings/${listingId}/favorite/`, { method: 'POST', auth: true });
}

export async function removeFavorite(listingId: number) {
  try {
    await apiFetch<unknown>(`/api/listings/${listingId}/favorite/`, {
      method: 'DELETE',
      auth: true,
    });
  } catch (error) {
    // 404 = it wasn't a favorite anyway, which is what we wanted.
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
}

/** The seller marks their own listing as sold. */
export function markListingSold(listingId: number) {
  return apiFetch<ListingDetail>(`/api/listings/${listingId}/`, {
    method: 'PATCH',
    body: { status: 'sold' },
    auth: true,
  });
}

/** Active listings, newest first. `page` starts at 1. */
export function fetchListings({ page, category }: { page: number; category?: number | null }) {
  const params = new URLSearchParams({ page: String(page) });
  if (category) params.set('category', String(category));
  return apiFetch<ListingsPage>(`/api/listings/?${params}`);
}

/** All categories (names in Arabic, French and English). */
export function fetchCategories() {
  return apiFetch<Category[]>('/api/categories/');
}
