import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { markSafetyTipsSeen } from '@/api/safety';
import { useAuth } from '@/auth/auth-provider';
import { PrimaryButton } from '@/components/primary-button';
import { RequireAuth } from '@/components/require-auth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useLanguage } from '@/i18n/language-provider';

type Tip = { icon: ComponentProps<typeof Ionicons>['name']; key: string; warn?: boolean };

const TIPS: Tip[] = [
  { icon: 'chatbubbles-outline', key: 'chat' },
  { icon: 'people-outline', key: 'meet' },
  { icon: 'search-outline', key: 'check' },
  { icon: 'card-outline', key: 'noAdvance', warn: true },
];

/** Shown once, before the first conversation: four simple tips to buy safely. */
function BuySafelyContent() {
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const { user, updateUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const align = { textAlign: direction === 'rtl' ? 'right' : 'left', writingDirection: direction } as const;

  const understood = async () => {
    setSaving(true);
    try {
      const { user: updated } = await markSafetyTipsSeen();
      await updateUser(updated);
    } catch {
      // No connection: don't block the user. Remember it on this phone for now;
      // the server will ask again next time, which is harmless.
      if (user) await updateUser({ ...user, safety_tips_seen: true });
    } finally {
      setSaving(false);
    }
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.shield}>
          <Ionicons name="shield-checkmark" size={40} color="#1E8E3E" />
        </View>
        <ThemedText type="subtitle" style={styles.center}>
          {t('safety.title')}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {t('safety.intro')}
        </ThemedText>
      </View>

      {TIPS.map((tip) => (
        <ThemedView
          key={tip.key}
          type="backgroundElement"
          style={[styles.tip, tip.warn && styles.warnTip]}>
          <Ionicons name={tip.icon} size={26} color={tip.warn ? '#B3261E' : '#208AEF'} />
          <View style={styles.flex}>
            <ThemedText type="smallBold" style={[align, tip.warn && styles.warnText]}>
              {t(`safety.tips.${tip.key}.title`)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={align}>
              {t(`safety.tips.${tip.key}.text`)}
            </ThemedText>
          </View>
        </ThemedView>
      ))}

      <PrimaryButton title={t('safety.understood')} onPress={understood} loading={saving} />
    </ScrollView>
  );
}

export default function BuySafelyScreen() {
  return (
    <RequireAuth next="/">
      <BuySafelyContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  header: { alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  shield: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,142,62,0.12)',
  },
  center: { textAlign: 'center' },
  flex: { flex: 1, gap: Spacing.half },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  warnTip: { borderWidth: 1, borderColor: 'rgba(179,38,30,0.35)' },
  warnText: { color: '#B3261E' },
});
