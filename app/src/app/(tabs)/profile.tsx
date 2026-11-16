import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
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

      {/* Phone verification */}
      <ThemedView type="backgroundElement" style={[styles.card, styles.verifyCard]}>
        <View style={styles.verifyRow}>
          <Ionicons
            name={user.phone_verified ? 'checkmark-circle' : 'alert-circle-outline'}
            size={22}
            color={user.phone_verified ? '#1E8E3E' : '#E37400'}
          />
          <ThemedText
            type="smallBold"
            style={user.phone_verified ? styles.verifiedText : styles.unverifiedText}>
            {user.phone_verified ? t('profile.phoneVerified') : t('profile.phoneNotVerified')}
          </ThemedText>
        </View>
        {!user.phone_verified && (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {t('profile.whyVerify')}
            </ThemedText>
            <PrimaryButton
              title={t('profile.verifyNow')}
              onPress={() =>
                router.push({ pathname: '/verify-phone', params: { next: '/profile' } } as Href)
              }
            />
          </>
        )}
      </ThemedView>

      <LanguageSwitcher />

      <PrimaryButton
        title={t('block.listTitle')}
        variant="secondary"
        onPress={() => router.push('/blocked-users' as Href)}
      />

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
  verifyCard: { gap: Spacing.three },
  verifyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  verifiedText: { color: '#1E8E3E' },
  unverifiedText: { color: '#B06000' },
});
