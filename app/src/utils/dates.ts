import type { Language } from '@/i18n';

// Written by hand (React Native's JavaScript engine doesn't reliably have month names).
// Arabic uses the month names used in Algeria.
export const MONTHS: Record<Language, string[]> = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre',
    'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December'],
  ar: ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر',
    'نوفمبر', 'ديسمبر'],
};

/** "novembre 2026" / "November 2026" / "نوفمبر 2026" */
export function monthYear(date: string | Date, language: Language): string {
  const d = new Date(date);
  return `${MONTHS[language][d.getMonth()]} ${d.getFullYear()}`;
}
