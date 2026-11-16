import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ListingSummary } from '@/api/listings';
import type { Language } from '@/i18n';
import { useTokens } from '@/theme';
import { AppText, Badge } from '@/ui';
import { formatPrice } from '@/utils/format';

type Props = {
  listing: ListingSummary;
  language: Language;
  direction: 'rtl' | 'ltr';
  onPress: (listing: ListingSummary) => void;
  /** Shows a filled heart; tapping it removes the listing from my favourites. */
  onUnfavorite?: (listing: ListingSummary) => void;
};

/** One card in a grid: photo, price, size and brand (and Sold / Reserved). */
export const ListingCard = memo(function ListingCard({
  listing,
  language,
  direction,
  onPress,
  onUnfavorite,
}: Props) {
  const tk = useTokens();
  const { t } = useTranslation();
  const price = formatPrice(listing.price_dzd, language);
  const details = [listing.size, listing.brand].filter(Boolean).join(' · ');
  const startCorner = direction === 'rtl' ? { right: tk.space.sm } : { left: tk.space.sm };
  const endCorner = direction === 'rtl' ? { left: tk.space.sm } : { right: tk.space.sm };

  return (
    <Pressable
      onPress={() => onPress(listing)}
      accessibilityRole="button"
      accessibilityLabel={[listing.title, price, details].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.card, { gap: tk.space.xxs }, pressed && styles.pressed]}>
      <View style={[styles.photo, { backgroundColor: tk.color.surfaceAlt, borderRadius: tk.radius.lg, marginBottom: tk.space.xs }]}>
        {listing.cover_photo ? (
          <Image
            source={{ uri: listing.cover_photo }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
            recyclingKey={String(listing.id)}
          />
        ) : (
          <Ionicons name="image-outline" size={32} color={tk.color.textMuted} />
        )}
        {listing.status !== 'active' && (
          <View style={[styles.corner, startCorner, { top: tk.space.sm }]}>
            <Badge
              label={listing.status === 'sold' ? t('listing.sold') : t('listing.reserved')}
              tone={listing.status === 'sold' ? 'danger' : 'warning'}
              solid
            />
          </View>
        )}
        {onUnfavorite && (
          <Pressable
            onPress={() => onUnfavorite(listing)}
            accessibilityRole="button"
            accessibilityLabel={t('listing.removeFavorite')}
            hitSlop={8}
            style={[styles.heart, endCorner, { top: tk.space.sm, backgroundColor: tk.color.background }]}>
            <Ionicons name="heart" size={20} color={tk.color.danger} />
          </Pressable>
        )}
      </View>
      <AppText variant="bodyStrong" numberOfLines={1}>
        {price}
      </AppText>
      {details ? (
        <AppText variant="small" tone="secondary" numberOfLines={1}>
          {details}
        </AppText>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1 },
  pressed: { opacity: 0.8 },
  photo: { aspectRatio: 4 / 5, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute' },
  heart: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
