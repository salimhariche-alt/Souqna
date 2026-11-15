import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ar from './locales/ar';
import en from './locales/en';
import fr from './locales/fr';

export const LANGUAGES = ['fr', 'ar', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'fr';

/** Names shown in the language switcher, each written in its own language. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  fr: 'Français',
  ar: 'العربية',
  en: 'English',
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export function directionOf(language: Language): 'rtl' | 'ltr' {
  return language === 'ar' ? 'rtl' : 'ltr';
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false }, // React already protects against unsafe text
});

export default i18n;
