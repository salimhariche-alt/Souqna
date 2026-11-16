import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { type ComponentProps, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { searchMembers, type PublicProfile } from '@/api/auth';
import type { Category } from '@/api/listings';
import { Avatar } from '@/components/avatar';
import { mainCategoriesInOrder } from '@/components/category-chips';
import { FeedMessage } from '@/components/feed-message';
import { FiltersSheet } from '@/components/filters-sheet';
import { ListingGrid } from '@/components/listing-grid';
import { categoryName, useCategories } from '@/hooks/use-categories';
import { useListingsFeed } from '@/hooks/use-listings-feed';
import { useLanguage } from '@/i18n/language-provider';
import {
  activeFilterChips,
  NO_FILTERS,
  type SearchFilters,
  withoutFilter,
} from '@/search/filter-chips';
import { useTokens } from '@/theme';
import { AppText, Badge } from '@/ui';
import { itemsCount } from '@/utils/count';

const TYPING_DELAY_MS = 500;
type IconName = ComponentProps<typeof Ionicons>['name'];

/** Our own simple icon for each main category (by its English name). */
const CATEGORY_ICONS: Record<string, IconName> = {
  Women: 'woman-outline',
  Men: 'man-outline',
  Kids: 'happy-outline',
  Home: 'home-outline',
  Electronics: 'phone-portrait-outline',
};

/**
 * Browse: a search bar, then the categories as large tiles. Searching, tapping a
 * category or setting a filter shows the matching listings (and matching members).
 */
export default function BrowseScreen() {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language, direction } = useLanguage();
  const { categories, reload: reloadCategories } = useCategories();

  const [query, setQuery] = useState(''); // what's in the search box
  const [search, setSearch] = useState(''); // what we actually search for
  const [filters, setFilters] = useState<SearchFilters>(NO_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [members, setMembers] = useState<PublicProfile[]>([]);

  // Search half a second after the user stops typing, not on every letter.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), TYPING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Members whose name matches (2 letters or more).
  useEffect(() => {
    if (search.length < 2) {
      setMembers([]);
      return;
    }
    let current = true;
    searchMembers(search)
      .then((found) => current && setMembers(found))
      .catch(() => current && setMembers([]));
    return () => {
      current = false;
    };
  }, [search]);

  const chips = useMemo(
    () => activeFilterChips(filters, categories, language, t),
    [filters, categories, language, t],
  );
  const showResults = chips.length > 0 || search !== '';
  const feed = useListingsFeed({ ...filters, search });

  const clearSearchText = () => {
    setQuery('');
    setSearch(''); // straight away, without waiting
  };
  const backToCategories = () => {
    clearSearchText();
    setFilters(NO_FILTERS);
  };

  const searchBar = (
    <View style={[styles.topRow, { gap: tk.space.sm, paddingHorizontal: tk.space.lg }]}>
      {showResults && (
        <Pressable
          onPress={backToCategories}
          accessibilityRole="button"
          accessibilityLabel={t('browse.backToCategories')}
          hitSlop={8}
          style={[styles.iconButton, { backgroundColor: tk.color.surface, borderRadius: tk.radius.full }]}>
          <Ionicons name={direction === 'rtl' ? 'arrow-forward' : 'arrow-back'} size={20} color={tk.color.text} />
        </Pressable>
      )}
      <View style={[styles.searchBox, { backgroundColor: tk.color.surface, borderRadius: tk.radius.full, paddingHorizontal: tk.space.lg }]}>
        <Ionicons name="search" size={20} color={tk.color.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => setSearch(query.trim())}
          placeholder={t('browse.placeholder')}
          placeholderTextColor={tk.color.textMuted}
          accessibilityLabel={t('browse.placeholder')}
          returnKeyType="search"
          autoCorrect={false}
          style={[
            tk.text.body,
            styles.searchInput,
            { color: tk.color.text, textAlign: direction === 'rtl' ? 'right' : 'left', writingDirection: direction },
          ]}
        />
        {query ? (
          <Pressable onPress={clearSearchText} accessibilityRole="button" accessibilityLabel={t('search.clearSearch')} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={tk.color.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {showResults && (
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={chips.length ? t('search.filtersWithCount', { count: chips.length }) : t('search.filters')}
          hitSlop={8}
          style={[styles.iconButton, { backgroundColor: chips.length ? tk.color.primarySoft : tk.color.surface, borderRadius: tk.radius.full }]}>
          <Ionicons name="options-outline" size={20} color={chips.length ? tk.color.primary : tk.color.text} />
          {chips.length ? (
            <View style={[styles.countDot, { backgroundColor: tk.color.primary }]}>
              <AppText variant="caption" style={{ color: tk.color.onPrimary, lineHeight: 14 }}>
                {chips.length}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: tk.color.background }]}>
      {searchBar}

      {!showResults ? (
        <CategoryTiles
          categories={mainCategoriesInOrder(categories)}
          onOpen={(category) => setFilters({ ...NO_FILTERS, category: category.id })}
          onRetry={reloadCategories}
        />
      ) : (
        <>
          {chips.length ? (
            <View style={[styles.chips, { gap: tk.space.sm, paddingHorizontal: tk.space.lg }]}>
              {chips.map((chip) => (
                <Pressable
                  key={chip.key}
                  onPress={() => setFilters(withoutFilter(filters, chip.key))}
                  accessibilityRole="button"
                  accessibilityLabel={t('search.removeFilter', { label: chip.label })}
                  style={[styles.chip, { backgroundColor: tk.color.primarySoft, borderRadius: tk.radius.full }]}>
                  <AppText variant="smallStrong" tone="primary">
                    {chip.label}
                  </AppText>
                  <Ionicons name="close" size={16} color={tk.color.primary} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <ListingGrid
            feed={feed}
            onRetry={feed.retry}
            headerComponent={
              <View style={{ gap: tk.space.md, paddingHorizontal: tk.space.sm }}>
                {members.length > 0 && <MembersRow members={members} />}
                {feed.items.length ? (
                  <AppText variant="smallStrong" tone="secondary">
                    {itemsCount(feed.count, language)}
                  </AppText>
                ) : null}
              </View>
            }
            emptyComponent={
              <FeedMessage
                kind="message"
                icon="search-outline"
                text={t('search.noResults')}
                buttonLabel={t('search.clearFilters')}
                onPress={backToCategories}
              />
            }
          />
        </>
      )}

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
    </View>
  );
}

/** The categories as large tiles, 2 per row. */
function CategoryTiles({
  categories,
  onOpen,
  onRetry,
}: {
  categories: Category[];
  onOpen: (category: Category) => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();

  if (!categories.length) {
    return (
      <FeedMessage kind="message" icon="cloud-offline-outline" text={t('home.error')} buttonLabel={t('home.retry')} onPress={onRetry} />
    );
  }
  return (
    <FlatList
      data={categories}
      keyExtractor={(c) => String(c.id)}
      numColumns={2}
      contentContainerStyle={[styles.tiles, { padding: tk.space.sm, maxWidth: tk.maxWidth }]}
      ListHeaderComponent={
        <AppText variant="title" style={{ paddingHorizontal: tk.space.sm, paddingVertical: tk.space.sm }}>
          {t('browse.categories')}
        </AppText>
      }
      renderItem={({ item }) => (
        <View style={styles.tileCell}>
          <Pressable
            onPress={() => onOpen(item)}
            accessibilityRole="button"
            accessibilityLabel={categoryName(item, language)}
            style={({ pressed }) => [
              styles.tile,
              {
                backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface,
                borderRadius: tk.radius.xl,
                padding: tk.space.lg,
              },
            ]}>
            <View style={[styles.tileIcon, { backgroundColor: tk.color.primarySoft }]}>
              <Ionicons name={CATEGORY_ICONS[item.name_en] ?? 'pricetag-outline'} size={30} color={tk.color.primary} />
            </View>
            <AppText variant="bodyStrong" numberOfLines={2}>
              {categoryName(item, language)}
            </AppText>
          </Pressable>
        </View>
      )}
    />
  );
}

/** Members whose name matches the search: tap one to open their profile. */
function MembersRow({ members }: { members: PublicProfile[] }) {
  const { t } = useTranslation();
  const tk = useTokens();
  return (
    <View style={{ gap: tk.space.sm }}>
      <AppText variant="smallStrong" tone="secondary">
        {t('browse.members')}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: tk.space.sm }}>
        {members.map((member) => (
          <Pressable
            key={member.id}
            onPress={() => router.push(`/seller/${member.id}` as Href)}
            accessibilityRole="button"
            accessibilityLabel={t('seller.open', { name: member.display_name })}
            style={({ pressed }) => [
              styles.member,
              {
                backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface,
                borderRadius: tk.radius.lg,
                padding: tk.space.md,
                gap: tk.space.xs,
              },
            ]}>
            <Avatar uri={member.avatar} name={member.display_name} size={48} />
            <AppText variant="smallStrong" align="center" numberOfLines={1}>
              {member.display_name}
            </AppText>
            {member.phone_verified ? <Badge label={t('browse.verified')} tone="success" icon="checkmark-circle" /> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  searchInput: { flex: 1, paddingVertical: 10 },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  countDot: {
    position: 'absolute',
    top: 4,
    end: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 8,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12 },
  tiles: { width: '100%', alignSelf: 'center' },
  tileCell: { width: '50%', padding: 6 },
  tile: { minHeight: 132, justifyContent: 'space-between', gap: 12 },
  tileIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  member: { width: 112, alignItems: 'center' },
});
