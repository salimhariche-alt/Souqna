import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type Props = {
  /** Translation key of the screen name, e.g. "tabs.search". */
  titleKey: string;
  children?: ReactNode;
};

/** A simple "coming soon" screen that shows its name in the selected language. */
export function PlaceholderScreen({ titleKey, children }: Props) {
  const { t } = useTranslation();
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">{t(titleKey)}</ThemedText>
      <ThemedText themeColor="textSecondary">{t('placeholder.comingSoon')}</ThemedText>
      {children}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
});
