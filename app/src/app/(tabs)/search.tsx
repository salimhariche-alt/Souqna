import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { FeedMessage } from '@/components/feed-message';
import { FiltersSheet } from '@/components/filters-sheet';
import { ListingGrid } from '@/components/listing-grid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { useCategories } from '@/hooks/use-categories';
import { useListingsFeed } from '@/hooks/use-listings-feed';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language-provider';
import {
  activeFilterChips,
  NO_FILTERS,
  type SearchFilters,
  withoutFilter,
} from '@/search/filter-chips';
import { itemsCount } from '@/utils/count';

const TYPING_DELAY_MS = 500;

/** Search: a search bar, filters, and the matching listings in the same grid as Home. */
export default function SearchScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { language, direction } = useLanguage();
  const { categories, reload: reloadCategories } = useCategories();

  const [query, setQuery] = useState(''); // what's in the search box
  const [search, setSearch] = useState(''); // what we actually search for
  const [filters, setFilters] = useState<SearchFilters>(NO_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Search half a second after the user stops typing, not on every letter.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), TYPING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const feed = useListingsFeed({ ...filters, search });
  const chips = useMemo(
    () => activeFilterChips(filters, categories, language, t),
    [filters, categories, language, t],
  );
  const isFiltered = chips.length > 0 || search !== '';

  const clearSearchText = () => {
    setQuery('');
    setSearch(''); // straight away, without waiting
  };
  const clearEverything = () => {
    clearSearchText();
    setFilters(NO_FILTERS);
  };

  return (
    <ThemedView style={styles.screen}>
      {/* Search bar + Filters button */}
      <View style={styles.topRow}>
        <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => setSearch(query.trim())}
            placeholder={t('search.placeholder')}
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel={t('search.placeholder')}
            returnKeyType="search"
            autoCorrect={false}
            style={[
              styles.searchInput,
              {
                color: theme.text,
                textAlign: direction === 'rtl' ? 'right' : 'left',
                writingDirection: direction,
              },
            ]}
          />
          {query ? (
            <Pressable
              onPress={clearSearchText}
              accessibilityRole="button"
              accessibilityLabel={t('search.clearSearch')}
              hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={
            chips.length
              ? t('search.filtersWithCount', { count: chips.length })
              : t('search.filters')
          }
          style={[styles.filtersButton, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="options-outline" size={20} color={theme.text} />
          <ThemedText type="smallBold">{t('search.filters')}</ThemedText>
          {chips.length ? (
            <View style={styles.badge}>
              <ThemedText type="smallBold" style={styles.badgeText}>
                {chips.length}
              </ThemedText>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* Active filters: tap the x to remove one */}
      {chips.length ? (
        <View style={styles.chips}>
          {chips.map((chip) => (
            <Pressable
              key={chip.key}
              onPress={() => setFilters(withoutFilter(filters, chip.key))}
              accessibilityRole="button"
              accessibilityLabel={t('search.removeFilter', { label: chip.label })}
              style={styles.chip}>
              <ThemedText type="small" style={styles.chipText}>
                {chip.label}
              </ThemedText>
              <Ionicons name="close" size={14} color="#ffffff" />
            </Pressable>
          ))}
        </View>
      ) : null}

      <ListingGrid
        feed={feed}
        onRetry={() => {
          feed.retry();
          if (categories.length === 0) reloadCategories();
        }}
        headerComponent={
          feed.items.length ? (
            <ThemedText
              type="smallBold"
              themeColor="textSecondary"
              style={[styles.count, { textAlign: direction === 'rtl' ? 'right' : 'left' }]}>
              {itemsCount(feed.count, language)}
            </ThemedText>
          ) : undefined
        }
        emptyComponent={
          isFiltered ? (
            <FeedMessage
              kind="message"
              icon="search-outline"
              text={t('search.noResults')}
              buttonLabel={t('search.clearFilters')}
              onPress={clearEverything}
            />
          ) : (
            <FeedMessage kind="message" icon="pricetags-outline" text={t('home.empty')} />
          )
        }
      />

      <FiltersSheet
        visible={sheetOpen}
        applied={filters}
        categories={categories}
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: Spacing.two },
  filtersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    minHeight: 44,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.fill,
  },
  badgeText: { color: '#ffffff', fontSize: 12, lineHeight: 16 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    backgroundColor: Brand.fill,
  },
  chipText: { color: '#ffffff' },
  count: { paddingHorizontal: Spacing.two, paddingTop: Spacing.one, paddingBottom: Spacing.one },
});
