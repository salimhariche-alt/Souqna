import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Placeholder for one listing's page (built in the next step). */
export default function ListingDetailsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ThemedView style={styles.container}>
      <Ionicons name="pricetag-outline" size={44} color={theme.textSecondary} />
      <ThemedText type="subtitle" style={styles.center}>
        {t('listing.number', { id })}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.center}>
        {t('placeholder.comingSoon')}
      </ThemedText>
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
  center: { textAlign: 'center' },
});
