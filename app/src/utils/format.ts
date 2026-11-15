import type { Language } from '@/i18n';

// A non-breaking space: keeps "2 500 DA" on one line.
const NBSP = ' ';

const CURRENCY: Record<Language, string> = { fr: 'DA', en: 'DA', ar: 'د.ج' };

/** 2500 -> "2 500 DA" (French/English) or "2 500 د.ج" (Arabic). */
export function formatPrice(amount: number, language: Language): string {
  const digits = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${digits}${NBSP}${CURRENCY[language]}`;
}
