import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { wilayaLabel } from '@/constants/wilayas';
import { useLanguage } from '@/i18n/language-provider';
import { soldCount } from '@/utils/count';
import { monthYear } from '@/utils/dates';

type Props = {
  name: string;
  avatar: string | null;
  wilaya: number | null;
  phoneVerified: boolean;
  memberSince: string;
  itemsSold: number;
  /** Shown instead of the "verified" badge when the phone isn't verified (my own profile). */
  notVerifiedSlot?: ReactNode;
};

/** Photo, name, wilaya and trust info - for my profile and a seller's public profile. */
export function ProfileHeader({
  name,
  avatar,
  wilaya,
  phoneVerified,
  memberSince,
  itemsSold,
  notVerifiedSlot,
}: Props) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  return (
    <View style={styles.container}>
      <Avatar uri={avatar} name={name} size={88} />
      <ThemedText type="subtitle" style={styles.center}>
        {name}
      </ThemedText>
      {wilaya ? (
        <View style={styles.row}>
          <Ionicons name="location-outline" size={16} color="#8A8F98" />
          <ThemedText type="small" themeColor="textSecondary">
            {wilayaLabel(wilaya, language)}
          </ThemedText>
        </View>
      ) : null}
      {phoneVerified ? (
        <View style={styles.verified}>
          <Ionicons name="checkmark-circle" size={16} color="#1E8E3E" />
          <ThemedText type="smallBold" style={styles.verifiedText}>
            {t('listing.phoneVerified')}
          </ThemedText>
        </View>
      ) : (
        notVerifiedSlot
      )}
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        {t('listing.memberSince', { date: monthYear(memberSince, language) })} ·{' '}
        {soldCount(itemsSold, language)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: 999,
    backgroundColor: 'rgba(30,142,62,0.12)',
  },
  verifiedText: { color: '#1E8E3E' },
});
