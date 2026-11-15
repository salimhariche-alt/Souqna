import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { fetchCategories, type Category, type ListingSummary } from '@/api/listings';
import { CategoryChips, mainCategoriesInOrder } from '@/components/category-chips';
import { FeedMessage } from '@/components/feed-message';
import { ListingCard } from '@/components/listing-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useListingsFeed } from '@/hooks/use-listings-feed';
import { useLanguage } from '@/i18n/language-provider';

/** Home: a 2-column grid of active listings, newest first, with category chips. */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { language, direction } = useLanguage();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const feed = useListingsFeed(categoryId);

  const loadCategories = useCallback(() => {
    fetchCategories()
      .then((all) => setCategories(mainCategoriesInOrder(all)))
      .catch(() => {}); // the feed still works with just "All"
  }, []);
  useEffect(loadCategories, [loadCategories]);

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
        />
      </View>
    ),
    [language, direction, openListing],
  );

  const retryEverything = () => {
    feed.retry();
    if (categories.length === 0) loadCategories();
  };

  let body;
  if (feed.status === 'loading') {
    body = <FeedMessage kind="loading" text={t('home.loading')} />;
  } else if (feed.status === 'error') {
    body = (
      <FeedMessage
        kind="message"
        icon="cloud-offline-outline"
        text={t('home.error')}
        buttonLabel={t('home.retry')}
        onPress={retryEverything}
      />
    );
  } else {
    body = (
      <FlatList
        data={feed.items}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        numColumns={2}
        contentContainerStyle={styles.grid}
        refreshing={feed.refreshing}
        onRefresh={feed.refresh}
        onEndReached={feed.loadMore}
        onEndReachedThreshold={0.6}
        ListHeaderComponent={
          feed.refreshFailed ? (
            <ThemedText type="small" style={styles.refreshFailed}>
              {t('home.refreshFailed')}
            </ThemedText>
          ) : undefined
        }
        ListEmptyComponent={
          <FeedMessage
            kind="message"
            icon="pricetags-outline"
            text={categoryId ? t('home.emptyCategory') : t('home.empty')}
          />
        }
        ListFooterComponent={
          feed.loadingMore ? (
            <ActivityIndicator style={styles.footer} />
          ) : feed.loadMoreFailed ? (
            <View style={styles.footer}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                {t('home.loadMoreFailed')}
              </ThemedText>
              <Pressable onPress={feed.loadMore} accessibilityRole="button">
                <ThemedText type="smallBold" style={styles.link}>
                  {t('home.retry')}
                </ThemedText>
              </Pressable>
            </View>
          ) : undefined
        }
      />
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <CategoryChips categories={categories} selected={categoryId} onSelect={setCategoryId} />
      {body}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  grid: {
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.four,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    flexGrow: 1,
  },
  // Each card takes exactly half the width, so a lone last card doesn't stretch.
  cell: { width: '50%', padding: Spacing.two },
  footer: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.four },
  center: { textAlign: 'center' },
  link: { color: '#208AEF' },
  refreshFailed: {
    color: '#B3261E',
    textAlign: 'center',
    paddingVertical: Spacing.two,
  },
});
