import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { CategoryChips, mainCategoriesInOrder } from '@/components/category-chips';
import { FeedMessage } from '@/components/feed-message';
import { ListingGrid } from '@/components/listing-grid';
import { ThemedView } from '@/components/themed-view';
import { useCategories } from '@/hooks/use-categories';
import { useListingsFeed } from '@/hooks/use-listings-feed';

/** Home: a 2-column grid of active listings, newest first, with category chips. */
export default function HomeScreen() {
  const { t } = useTranslation();
  const { categories: allCategories, reload: loadCategories } = useCategories();
  const categories = useMemo(() => mainCategoriesInOrder(allCategories), [allCategories]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const feed = useListingsFeed({ category: categoryId });

  return (
    <ThemedView style={styles.screen}>
      <CategoryChips categories={categories} selected={categoryId} onSelect={setCategoryId} />
      <ListingGrid
        feed={feed}
        onRetry={() => {
          feed.retry();
          if (categories.length === 0) loadCategories();
        }}
        emptyComponent={
          <FeedMessage
            kind="message"
            icon="pricetags-outline"
            text={categoryId ? t('home.emptyCategory') : t('home.empty')}
          />
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
