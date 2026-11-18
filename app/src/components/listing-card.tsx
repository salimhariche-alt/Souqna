import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ListingSummary } from '@/api/listings';
import { useAuth } from '@/auth/auth-provider';
import { useFavoriteIds } from '@/hooks/use-favorite-ids';
import type { Language } from '@/i18n';
import { BrandPalette, FontFiles, useTokens } from '@/theme';
import { AppText, Badge, DesignIcon } from '@/ui';
import { formatPrice } from '@/utils/format';

type Props = {
  listing: ListingSummary;
  language: Language;
  direction: 'rtl' | 'ltr';
  onPress: (listing: ListingSummary) => void;
  /** Favourites screen: tapping the (filled) heart removes the listing from my favourites. */
  onUnfavorite?: (listing: ListingSummary) => void;
};

/** Soft tints behind photos while they load (as in home.html). */
const TINTS = ['#F0D9C4', '#D9E3EE', '#EBDDB3', '#DDE3CC'];

/**
 * One card in a 2-column grid, as "Les bonnes affaires du souk" in home.html: a cream
 * card (padding 8, border, corners 20), the photo (178 high, corners 14) with a round
 * heart, then the price (Fraunces 17, terracotta), the title (13) and size · condition.
 */
export const ListingCard = memo(function ListingCard({ listing, language, direction, onPress, onUnfavorite }: Props) {
  const tk = useTokens();
  const { t } = useTranslation();
  const { status } = useAuth();
  const favorites = useFavoriteIds();
  const price = formatPrice(listing.price_dzd, language);
  const details = [listing.size, listing.condition ? t(`listing.conditions.${listing.condition}`) : '']
    .filter(Boolean)
    .join(' · ');
  const liked = onUnfavorite ? true : favorites.isFavorite(listing.id);
  const rtl = direction === 'rtl';

  const onHeart = () => {
    if (onUnfavorite) return onUnfavorite(listing);
    if (status !== 'signedIn') {
      router.push({ pathname: '/login', params: { next: `/listing/${listing.id}` } } as Href);
      return;
    }
    favorites.toggle(listing.id);
  };

  return (
    <View style={[styles.card, { backgroundColor: tk.color.surface, borderColor: tk.color.border }]}>
      <View>
        <Pressable
          onPress={() => onPress(listing)}
          accessibilityRole="button"
          accessibilityLabel={[listing.title, price, details].filter(Boolean).join(', ')}
          style={({ pressed }) => [
            styles.photo,
            { backgroundColor: TINTS[listing.id % TINTS.length], opacity: pressed ? 0.85 : 1 },
          ]}>
          {listing.cover_photo ? (
            <Image
              source={{ uri: listing.cover_photo }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={150}
              recyclingKey={String(listing.id)}
            />
          ) : (
            <View style={styles.center}>
              <DesignIcon name="bag" size={54} color={BrandPalette.inkSoft} strokeWidth={1.1} />
            </View>
          )}
          {listing.status !== 'active' && (
            <View style={[styles.status, rtl ? { right: 8 } : { left: 8 }]}>
              <Badge
                label={listing.status === 'sold' ? t('listing.sold') : t('listing.reserved')}
                tone={listing.status === 'sold' ? 'danger' : 'warning'}
                solid
              />
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={onHeart}
          accessibilityRole="button"
          accessibilityState={{ selected: liked }}
          accessibilityLabel={liked ? t('listing.removeFavorite') : t('listing.addFavorite')}
          style={[styles.heart, rtl ? { left: 6 } : { right: 6 }]}>
          <DesignIcon
            name="heart"
            size={18}
            strokeWidth={1.8}
            color={liked ? tk.color.primary : BrandPalette.ink}
            fill={liked ? tk.color.primary : 'none'}
          />
        </Pressable>
      </View>
      <Pressable onPress={() => onPress(listing)} accessible={false} style={styles.text}>
        <Text
          numberOfLines={1}
          style={[styles.price, { color: tk.color.primary, fontFamily: language === 'ar' ? FontFiles.arabicBold : FontFiles.serifBold }]}>
          {price}
        </Text>
        <AppText variant="small" numberOfLines={1} style={styles.title}>
          {listing.title}
        </AppText>
        {details ? (
          <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.meta}>
            {details}
          </AppText>
        ) : null}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, gap: 8, padding: 8, borderWidth: 1, borderRadius: 20 },
  photo: { height: 178, borderRadius: 14, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  status: { position: 'absolute', bottom: 8 },
  heart: {
    position: 'absolute',
    top: 6,
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: 'rgba(255,251,245,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { gap: 1, paddingHorizontal: 4, paddingBottom: 4 },
  price: { fontSize: 17, lineHeight: 22 },
  title: { fontSize: 13, lineHeight: 18 },
  meta: { fontSize: 12, lineHeight: 16 },
});
