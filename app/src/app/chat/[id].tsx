import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { RequireAuth } from '@/components/require-auth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Placeholder for one conversation (the real chat is built in step #6). */
export default function ChatScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RequireAuth next="/messages">
      <ThemedView style={styles.container}>
        <Ionicons name="chatbubbles-outline" size={44} color={theme.textSecondary} />
        <ThemedText type="subtitle" style={styles.center}>
          {t('chat.number', { id })}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {t('chat.messageSent')}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {t('placeholder.comingSoon')}
        </ThemedText>
      </ThemedView>
    </RequireAuth>
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
