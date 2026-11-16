import type { TFunction } from 'i18next';

import type { Category, ListingFilters } from '@/api/listings';
import { wilayaLabel } from '@/constants/wilayas';
import { categoryName } from '@/hooks/use-categories';
import type { Language } from '@/i18n';
import { formatPrice } from '@/utils/format';

/** The filters chosen in the Filters sheet (the search text is kept separately). */
export type SearchFilters = Omit<ListingFilters, 'search'>;

export const NO_FILTERS: SearchFilters = {
  category: null,
  wilaya: null,
  minPrice: null,
  maxPrice: null,
  size: '',
  condition: null,
};

type FilterKey = 'category' | 'wilaya' | 'price' | 'size' | 'condition';
export type FilterChip = { key: FilterKey; label: string };

/** One chip per active filter, e.g. "Femmes", "16 - Alger", "1 000 DA – 5 000 DA". */
export function activeFilterChips(
  filters: SearchFilters,
  categories: Category[],
  language: Language,
  t: TFunction,
): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.category) {
    const category = categories.find((c) => c.id === filters.category);
    chips.push({ key: 'category', label: category ? categoryName(category, language) : '…' });
  }
  if (filters.wilaya) {
    chips.push({ key: 'wilaya', label: wilayaLabel(filters.wilaya, language) });
  }
  const min = filters.minPrice ? formatPrice(filters.minPrice, language) : null;
  const max = filters.maxPrice ? formatPrice(filters.maxPrice, language) : null;
  if (min && max) chips.push({ key: 'price', label: t('search.priceBetween', { min, max }) });
  else if (min) chips.push({ key: 'price', label: t('search.priceFrom', { min }) });
  else if (max) chips.push({ key: 'price', label: t('search.priceTo', { max }) });

  if (filters.size?.trim()) {
    chips.push({ key: 'size', label: t('search.sizeChip', { size: filters.size.trim() }) });
  }
  if (filters.condition) {
    chips.push({ key: 'condition', label: t(`listing.conditions.${filters.condition}`) });
  }
  return chips;
}

/** The same filters with one of them removed (tapping the x on its chip). */
export function withoutFilter(filters: SearchFilters, key: FilterKey): SearchFilters {
  switch (key) {
    case 'price':
      return { ...filters, minPrice: null, maxPrice: null };
    case 'size':
      return { ...filters, size: '' };
    default:
      return { ...filters, [key]: null };
  }
}
