import { useCallback, useEffect, useState } from 'react';

import { fetchCategories, type Category } from '@/api/listings';
import type { Language } from '@/i18n';

// Categories rarely change, so load them once and share them between screens.
let cache: Category[] | null = null;
let inFlight: Promise<Category[]> | null = null;

function loadOnce(): Promise<Category[]> {
  if (cache) return Promise.resolve(cache);
  if (!inFlight) {
    inFlight = fetchCategories()
      .then((categories) => {
        cache = categories;
        return categories;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** All categories. `reload()` tries again after a network error. */
export function useCategories() {
  const [categories, setCategories] = useState<Category[]>(cache ?? []);

  const reload = useCallback(() => {
    loadOnce()
      .then(setCategories)
      .catch(() => {}); // screens still work without category names
  }, []);

  useEffect(reload, [reload]);
  return { categories, reload };
}

export function categoryName(category: Category, language: Language): string {
  return { ar: category.name_ar, fr: category.name_fr, en: category.name_en }[language];
}
