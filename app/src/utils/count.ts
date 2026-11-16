/**
 * "45 articles" / "45 items" / "45 منتجًا".
 * Written by hand (like time-ago.ts) because Arabic has different words for
 * 1, 2, 3-10 and 11-99, and React Native's JavaScript engine lacks full plural support.
 */
import type { Language } from '@/i18n';

const NBSP = ' ';

function withSpaces(n: number) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export function itemsCount(n: number, language: Language): string {
  const number = withSpaces(n);
  if (language === 'fr') return `${number} ${n <= 1 ? 'article' : 'articles'}`; // 0 and 1: singular
  if (language === 'en') return `${number} ${n === 1 ? 'item' : 'items'}`;

  if (n === 1) return 'منتج واحد';
  if (n === 2) return 'منتجان';
  const lastTwo = n % 100;
  if (lastTwo >= 3 && lastTwo <= 10) return `${number} منتجات`;
  if (lastTwo >= 11 && lastTwo <= 99) return `${number} منتجًا`;
  return `${number} منتج`; // 0, 100, 101, 102, ...
}

/** "12 articles vendus" / "12 items sold" / "المنتجات المباعة: 12" (seller trust info). */
export function soldCount(n: number, language: Language): string {
  const number = withSpaces(n);
  if (language === 'fr') {
    if (n === 0) return 'Aucun article vendu pour le moment';
    return `${number} ${n === 1 ? 'article vendu' : 'articles vendus'}`;
  }
  if (language === 'en') {
    if (n === 0) return 'No items sold yet';
    return `${number} ${n === 1 ? 'item sold' : 'items sold'}`;
  }
  if (n === 0) return 'لم يبع أي منتج بعد';
  return `المنتجات المباعة: ${number}`;
}
