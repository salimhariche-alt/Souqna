import { apiFetch } from './client';

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
