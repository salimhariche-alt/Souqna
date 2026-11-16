import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ListingSummary } from '@/api/listings';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Language } from '@/i18n';
import { formatPrice } from '@/utils/format';

type Props = {
  listing: ListingSummary;
  language: Language;
  direction: 'rtl' | 'ltr';
  onPress: (listing: ListingSummary) => void;
  /** Shows a filled heart; tapping it removes the listing from my favourites. */
  onUnfavorite?: (listing: ListingSummary) => void;
};

/** One card in the Home grid: photo, price, size and brand. */
export const ListingCard = memo(function ListingCard({
  listing,
  language,
  direction,
  onPress,
  onUnfavorite,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const startCorner = direction === 'rtl' ? { right: Spacing.two } : { left: Spacing.two };
  const endCorner = direction === 'rtl' ? { left: Spacing.two } : { right: Spacing.two };
  const price = formatPrice(listing.price_dzd, language);
  const details = [listing.size, listing.brand].filter(Boolean).join(' · ');
  // Latin brand names would otherwise line up left inside the Arabic layout.
  const align = { textAlign: direction === 'rtl' ? 'right' : 'left', writingDirection: direction } as const;

  return (
    <Pressable
      onPress={() => onPress(listing)}
      accessibilityRole="button"
      accessibilityLabel={[listing.title, price, details].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={[styles.photo, { backgroundColor: theme.backgroundSelected }]}>
        {listing.cover_photo ? (
          <Image
            source={{ uri: listing.cover_photo }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            recyclingKey={String(listing.id)}
          />
        ) : (
          <Ionicons name="image-outline" size={32} color={theme.textSecondary} />
        )}
        {listing.status !== 'active' && (
          <View
            style={[
              styles.badge,
              startCorner,
              listing.status === 'sold' ? styles.sold : styles.reserved,
            ]}>
            <ThemedText type="small" style={styles.badgeText}>
              {listing.status === 'sold' ? t('listing.sold') : t('listing.reserved')}
            </ThemedText>
          </View>
        )}
        {onUnfavorite && (
          <Pressable
            onPress={() => onUnfavorite(listing)}
            accessibilityRole="button"
            accessibilityLabel={t('listing.removeFavorite')}
            hitSlop={8}
            style={[styles.heart, endCorner]}>
            <Ionicons name="heart" size={20} color="#E0245E" />
          </Pressable>
        )}
      </View>
      <ThemedText type="smallBold" style={[styles.price, align]} numberOfLines={1}>
        {price}
      </ThemedText>
      {details ? (
        <ThemedText type="small" themeColor="textSecondary" style={align} numberOfLines={1}>
          {details}
        </ThemedText>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, gap: Spacing.half },
  pressed: { opacity: 0.8 },
  photo: {
    aspectRatio: 4 / 5,
    borderRadius: Spacing.two,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  price: { fontSize: 16 },
  badge: {
    position: 'absolute',
    top: Spacing.two,
    paddingVertical: 2,
    paddingHorizontal: Spacing.two,
    borderRadius: 999,
  },
  sold: { backgroundColor: '#D93025' },
  reserved: { backgroundColor: '#E37400' },
  badgeText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  heart: {
    position: 'absolute',
    top: Spacing.two,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
});
