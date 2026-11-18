import { router, type Href } from 'expo-router';
import { type ReactElement, useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ListingSummary } from '@/api/listings';
import { FeedMessage } from '@/components/feed-message';
import { ListingCard } from '@/components/listing-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { ListingsFeed } from '@/hooks/use-listings-feed';
import { useLanguage } from '@/i18n/language-provider';

type Props = {
  feed: ListingsFeed;
  /** What to show when there are no results (e.g. a friendly message). */
  emptyComponent: ReactElement;
  /** Shown above the cards, scrolling with them (e.g. "45 articles"). */
  headerComponent?: ReactElement;
  /** "Try again" after a connection error (defaults to retrying the feed). */
  onRetry?: () => void;
  /** Favourites: a heart on each card to remove it. */
  onUnfavorite?: (listing: ListingSummary) => void;
  /** Listings to leave out (e.g. just removed from favourites). */
  hiddenIds?: Set<number>;
};

/**
 * The 2-column grid of listing cards used by Home and Search: loading spinner,
 * error with "Try again", pull to refresh, and the next 20 when scrolling down.
 */
export function ListingGrid({
  feed,
  emptyComponent,
  headerComponent,
  onRetry,
  onUnfavorite,
  hiddenIds,
}: Props) {
  const { t } = useTranslation();
  const { language, direction } = useLanguage();

  const openListing = useCallback((listing: ListingSummary) => {
    router.push(`/listing/${listing.id}` as Href);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ListingSummary }) => (
      <View style={styles.cell}>
        <ListingCard
          listing={item}
          language={language}
          direction={direction}
          onPress={openListing}
          onUnfavorite={onUnfavorite}
        />
      </View>
    ),
    [language, direction, openListing, onUnfavorite],
  );

  if (feed.status === 'loading') {
    return <FeedMessage kind="loading" text={t('home.loading')} />;
  }
  if (feed.status === 'error') {
    return (
      <FeedMessage
        kind="message"
        icon="cloud-offline-outline"
        text={t('home.error')}
        buttonLabel={t('home.retry')}
        onPress={onRetry ?? feed.retry}
      />
    );
  }

  return (
    <FlatList
      data={hiddenIds?.size ? feed.items.filter((item) => !hiddenIds.has(item.id)) : feed.items}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      numColumns={2}
      contentContainerStyle={styles.grid}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      refreshing={feed.refreshing}
      onRefresh={feed.refresh}
      onEndReached={feed.loadMore}
      onEndReachedThreshold={0.6}
      ListHeaderComponent={
        feed.refreshFailed || headerComponent ? (
          <View>
            {feed.refreshFailed ? (
              <ThemedText themeColor="danger" type="small" style={styles.refreshFailed}>
                {t('home.refreshFailed')}
              </ThemedText>
            ) : null}
            {headerComponent}
          </View>
        ) : undefined
      }
      ListEmptyComponent={emptyComponent}
      ListFooterComponent={
        feed.loadingMore ? (
          <ActivityIndicator style={styles.footer} color="#B4472A" />
        ) : feed.loadMoreFailed ? (
          <View style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {t('home.loadMoreFailed')}
            </ThemedText>
            <Pressable onPress={feed.loadMore} accessibilityRole="button">
              <ThemedText type="smallBold" themeColor="primary" style={styles.link}>
                {t('home.retry')}
              </ThemedText>
            </Pressable>
          </View>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  // "Warm & Local" spacing (home.html): 20 on the sides, 12 between columns, 18 between rows.
  grid: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: Spacing.four,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    flexGrow: 1,
  },
  // Each card takes exactly half the width, so a lone last card doesn't stretch.
  cell: { width: '50%', paddingHorizontal: 6, paddingBottom: 18 },
  footer: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.four },
  center: { textAlign: 'center' },
  link: {},
  refreshFailed: { textAlign: 'center', paddingVertical: Spacing.two },
});
