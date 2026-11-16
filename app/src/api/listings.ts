import { File } from 'expo-file-system';
import { Platform } from 'react-native';

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
  seller: {
    id: number;
    display_name: string;
    wilaya: number | null;
    avatar: string | null;
    /** Trust info */
    phone_verified: boolean;
    member_since: string;
    items_sold: number;
  };
  photos: { id: number; image: string; position: number }[];
  /** True if it's in the logged-in user's favorites (always false when logged out). */
  is_favorited: boolean;
  /** Only the seller ever sees a listing that isn't "approved". */
  review_status: 'approved' | 'pending_review' | 'rejected';
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
  return setListingStatus(listingId, 'sold');
}

/** The seller sets their listing to active (on sale again), reserved or sold. */
export function setListingStatus(listingId: number, status: ListingSummary['status']) {
  return apiFetch<ListingDetail>(`/api/listings/${listingId}/`, {
    method: 'PATCH',
    body: { status },
    auth: true,
  });
}

/** The seller deletes their listing (it disappears everywhere). */
export function deleteListing(listingId: number) {
  return apiFetch<null>(`/api/listings/${listingId}/`, { method: 'DELETE', auth: true });
}

export const MY_LISTING_TABS = ['active', 'review', 'reserved', 'sold'] as const;
export type MyListingTab = (typeof MY_LISTING_TABS)[number];
export type MyListing = ListingSummary & {
  review_status: 'approved' | 'pending_review' | 'rejected';
};

/** My own listings in one tab, with how many are in each tab. */
export function fetchMyListings(tab: MyListingTab, page = 1) {
  return apiFetch<{
    count: number;
    next: string | null;
    results: MyListing[];
    counts: Record<MyListingTab, number>;
  }>(`/api/listings/mine/?tab=${tab}&page=${page}`, { auth: true });
}

/** My favourites, as a page of listings (like the Home grid). */
export async function fetchFavorites(page = 1): Promise<ListingsPage> {
  const data = await apiFetch<{
    count: number;
    next: string | null;
    previous: string | null;
    results: { listing: ListingSummary }[];
  }>(`/api/favorites/?page=${page}`, { auth: true });
  return { ...data, results: data.results.map((favorite) => favorite.listing) };
}

/** What the Sell / Edit form sends (photos go separately, one by one). */
export type ListingInput = {
  title: string;
  description: string;
  category: number;
  size: string;
  brand: string;
  condition: Condition;
  price_dzd: number;
  wilaya: number;
};

export function createListing(input: ListingInput) {
  return apiFetch<ListingDetail>('/api/listings/', { method: 'POST', body: input, auth: true });
}

export function updateListing(listingId: number, input: ListingInput) {
  return apiFetch<ListingDetail>(`/api/listings/${listingId}/`, {
    method: 'PATCH',
    body: input,
    auth: true,
  });
}

export type ListingPhoto = ListingDetail['photos'][number];

/** Upload one photo file (already resized). Photos can be big: wait up to 90 s. */
export async function uploadListingPhoto(listingId: number, fileUri: string) {
  const form = new FormData();
  if (Platform.OS === 'web') {
    // In a browser the photo is a "blob:" address: read it into a real file first.
    const blob = await (await fetch(fileUri)).blob();
    form.append('image', blob, 'photo.jpg');
  } else {
    // On a phone: Expo's fetch (SDK 58) does NOT accept React Native's old
    // { uri, name, type } file parts. It accepts a part that can give its bytes, plus a
    // name (the server needs a file name) and a type. The bytes are read while sending.
    const file = new File(fileUri);
    const part = { name: 'photo.jpg', type: 'image/jpeg', bytes: () => file.bytes() };
    form.append('image', part as unknown as Blob);
  }
  return apiFetch<ListingPhoto>(`/api/listings/${listingId}/photos/`, {
    method: 'POST',
    form,
    auth: true,
    timeoutMs: 90000,
  });
}

export async function deleteListingPhoto(listingId: number, photoId: number) {
  try {
    await apiFetch<unknown>(`/api/listings/${listingId}/photos/${photoId}/`, {
      method: 'DELETE',
      auth: true,
    });
  } catch (error) {
    // 404 = already gone, which is what we wanted.
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
}

/** Put the photos in this order; the first one becomes the cover. */
export function orderListingPhotos(listingId: number, photoIds: number[]) {
  return apiFetch<ListingPhoto[]>(`/api/listings/${listingId}/photos/order/`, {
    method: 'POST',
    body: { order: photoIds },
    auth: true,
  });
}

export const CONDITIONS = [
  'new_with_tags',
  'new_without_tags',
  'very_good',
  'good',
  'satisfactory',
] as const;
export type Condition = (typeof CONDITIONS)[number];

/** Everything the listings can be filtered by. Empty values are simply not sent. */
export type ListingFilters = {
  search?: string;
  category?: number | null;
  wilaya?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  size?: string;
  condition?: Condition | null;
  /** Only this seller's listings (public profile). */
  seller?: number | null;
};

/** Active listings, newest first, 20 per page. `page` starts at 1. */
export function fetchListings({ page, filters = {} }: { page: number; filters?: ListingFilters }) {
  const params = new URLSearchParams({ page: String(page) });
  const add = (name: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      params.set(name, String(value).trim());
    }
  };
  add('search', filters.search);
  add('category', filters.category);
  add('wilaya', filters.wilaya);
  add('min_price', filters.minPrice);
  add('max_price', filters.maxPrice);
  add('size', filters.size);
  add('condition', filters.condition);
  add('seller', filters.seller);
  return apiFetch<ListingsPage>(`/api/listings/?${params}`);
}

/** All categories (names in Arabic, French and English). */
export function fetchCategories() {
  return apiFetch<Category[]>('/api/categories/');
}
