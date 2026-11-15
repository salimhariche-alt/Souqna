import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { LanguageSwitcher } from '@/components/language-switcher';
import { PrimaryButton } from '@/components/primary-button';
import { RequireAuth } from '@/components/require-auth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { wilayaLabel } from '@/constants/wilayas';
import { useLanguage } from '@/i18n/language-provider';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText>{value}</ThemedText>
    </View>
  );
}

function ProfileContent() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { language } = useLanguage();
  const [loggingOut, setLoggingOut] = useState(false);

  if (!user) return null;

  const onLogout = async () => {
    setLoggingOut(true);
    router.navigate('/'); // go Home first, so this screen doesn't ask to log in again
    await logout();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="subtitle" style={styles.center}>
        {user.display_name}
      </ThemedText>

      <ThemedView type="backgroundElement" style={styles.card}>
        {user.phone ? <InfoRow label={t('profile.phone')} value={user.phone} /> : null}
        {user.email ? <InfoRow label={t('profile.email')} value={user.email} /> : null}
        {user.wilaya ? (
          <InfoRow label={t('profile.wilaya')} value={wilayaLabel(user.wilaya, language)} />
        ) : null}
      </ThemedView>

      <LanguageSwitcher />

      <PrimaryButton
        title={t('profile.logout')}
        onPress={onLogout}
        loading={loggingOut}
        variant="danger"
      />
    </ScrollView>
  );
}

export default function ProfileScreen() {
  return (
    <RequireAuth next="/profile">
      <ProfileContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
    gap: Spacing.four,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  center: { textAlign: 'center' },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  infoRow: { gap: Spacing.half },
});
