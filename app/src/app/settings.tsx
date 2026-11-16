import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { LanguageSwitcher } from '@/components/language-switcher';
import { PrimaryButton } from '@/components/primary-button';
import { RequireAuth } from '@/components/require-auth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language-provider';

function Row({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const theme = useTheme();
  const { direction } = useLanguage();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundElement }, pressed && styles.pressed]}>
      <Ionicons name={icon} size={22} color={danger ? '#D93025' : theme.text} />
      <ThemedText style={[styles.flex, danger && styles.danger]}>{label}</ThemedText>
      <Ionicons name={direction === 'rtl' ? 'chevron-back' : 'chevron-forward'} size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

function SettingsContent() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <LanguageSwitcher />
      <Row icon="ban-outline" label={t('block.listTitle')} onPress={() => router.push('/blocked-users' as Href)} />
      <Row icon="shield-checkmark-outline" label={t('safety.title')} onPress={() => router.push('/buy-safely' as Href)} />
      <PrimaryButton
        title={t('profile.logout')}
        variant="secondary"
        loading={loggingOut}
        onPress={async () => {
          setLoggingOut(true);
          router.navigate('/'); // go Home first, so this screen doesn't ask to log in again
          await logout();
        }}
      />
      <Row icon="trash-outline" label={t('deleteAccount.title')} onPress={() => router.push('/delete-account' as Href)} danger />
    </ScrollView>
  );
}

export default function SettingsScreen() {
  return (
    <RequireAuth next="/settings">
      <ThemedView style={styles.flex}>
        <SettingsContent />
      </ThemedView>
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  container: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: 480, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Spacing.three },
  danger: { color: '#D93025' },
});
