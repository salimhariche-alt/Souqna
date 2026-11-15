import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocaleProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import i18n, { DEFAULT_LANGUAGE, directionOf, isLanguage, type Language } from '@/i18n';

const STORAGE_KEY = 'souqna.language';

type LanguageContextValue = {
  language: Language;
  direction: 'rtl' | 'ltr';
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

/** Tell the web browser which language and direction the page uses. */
function applyToWebPage(language: Language) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.lang = language;
    document.documentElement.dir = directionOf(language);
  }
}

/**
 * Keeps track of the chosen language, remembers it on the device, and flips the
 * whole app right-to-left for Arabic.
 *
 * We flip the layout with `direction: 'rtl'` on the root view (plus Expo Router's
 * LocaleProvider for navigation) instead of I18nManager.forceRTL, because that
 * switches instantly, needs no app restart, and also works in Expo Go and on the web.
 */
export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [ready, setReady] = useState(false);

  // On start-up, load the language saved last time (French if none).
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .catch(() => null)
      .then(async (saved) => {
        const initial = isLanguage(saved) ? saved : DEFAULT_LANGUAGE;
        await i18n.changeLanguage(initial);
        applyToWebPage(initial);
        setLanguageState(initial);
        setReady(true);
        SplashScreen.hideAsync().catch(() => {});
      });
  }, []);

  const setLanguage = (next: Language) => {
    i18n.changeLanguage(next);
    applyToWebPage(next);
    setLanguageState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  if (!ready) {
    return null; // the splash screen stays visible for this split second
  }

  const direction = directionOf(language);
  return (
    <LanguageContext.Provider value={{ language, direction, setLanguage }}>
      <LocaleProvider direction={direction}>
        <View style={[styles.root, { direction }]}>{children}</View>
      </LocaleProvider>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error('useLanguage must be used inside <LanguageProvider>');
  }
  return value;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
