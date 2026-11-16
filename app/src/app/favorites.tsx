import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { fetchFavorites, removeFavorite, type ListingSummary } from '@/api/listings';
import { ListingGrid } from '@/components/listing-grid';
import { RequireAuth } from '@/components/require-auth';
import { useListingsFeed } from '@/hooks/use-listings-feed';
import { useTokens } from '@/theme';
import { EmptyState } from '@/ui';

const NO_FILTERS = {};

/** My favourites: the same grid as Home, with a heart to remove each one. */
function FavoritesContent() {
  const { t } = useTranslation();
  const tk = useTokens();
  const feed = useListingsFeed(NO_FILTERS, fetchFavorites);
  const [removed, setRemoved] = useState<Set<number>>(() => new Set());

  // Again when coming back (a listing may have been favourited elsewhere).
  useFocusEffect(
    useCallback(() => {
      setRemoved(new Set());
      feed.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const unfavorite = useCallback(async (listing: ListingSummary) => {
    setRemoved((set) => new Set(set).add(listing.id)); // disappears straight away
    try {
      await removeFavorite(listing.id);
    } catch {
      setRemoved((set) => {
        const copy = new Set(set);
        copy.delete(listing.id);
        return copy;
      });
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: tk.color.background, paddingTop: tk.space.sm }}>
      <ListingGrid
        feed={feed}
        onUnfavorite={unfavorite}
        hiddenIds={removed}
        emptyComponent={
          <EmptyState
            icon="heart-outline"
            title={t('profile.noFavoritesTitle')}
            text={t('profile.noFavorites')}
            actionLabel={t('messages.browse')}
            onAction={() => router.navigate('/')}
          />
        }
      />
    </View>
  );
}

export default function FavoritesScreen() {
  return (
    <RequireAuth next="/favorites">
      <FavoritesContent />
    </RequireAuth>
  );
}
