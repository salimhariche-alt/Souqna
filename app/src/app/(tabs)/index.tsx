import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { fetchActiveListingsCount } from '@/api/listings';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { API_URL } from '@/config';
import { Spacing } from '@/constants/theme';

type CountState =
  | { status: 'loading' }
  | { status: 'ok'; count: number }
  | { status: 'error'; detail: string };

/** Home: shows how many active listings the backend has, to prove they're connected. */
export default function HomeScreen() {
  const { t } = useTranslation();
  const [state, setState] = useState<CountState>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    fetchActiveListingsCount()
      .then((count) => setState({ status: 'ok', count }))
      .catch((error: unknown) =>
        setState({ status: 'error', detail: error instanceof Error ? error.message : String(error) }),
      );
  }, []);

  useEffect(load, [load]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="subtitle" style={styles.center}>
        {t('home.title')}
      </ThemedText>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText themeColor="textSecondary">{t('home.activeListings')}</ThemedText>
        {state.status === 'loading' && (
          <>
            <ActivityIndicator />
            <ThemedText type="small">{t('home.loading')}</ThemedText>
          </>
        )}
        {state.status === 'ok' && (
          <ThemedText type="title" testID="active-listings-count">
            {state.count}
          </ThemedText>
        )}
        {state.status === 'error' && (
          <>
            <ThemedText style={styles.error}>{t('home.error')}</ThemedText>
            <ThemedText type="code" themeColor="textSecondary">
              {state.detail}
            </ThemedText>
            <Pressable onPress={load} accessibilityRole="button" style={styles.retry}>
              <ThemedText type="smallBold" style={styles.retryText}>
                {t('home.retry')}
              </ThemedText>
            </Pressable>
          </>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {t('home.server', { url: API_URL })}
        </ThemedText>
      </ThemedView>

      <LanguageSwitcher />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
  },
  center: { textAlign: 'center' },
  card: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.four,
    minWidth: 260,
  },
  error: { color: '#D93025', textAlign: 'center' },
  retry: {
    marginTop: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    backgroundColor: '#208AEF',
  },
  retryText: { color: '#ffffff' },
});
