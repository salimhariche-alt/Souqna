import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { searchMembers, type PublicProfile } from '@/api/auth';
import type { Category } from '@/api/listings';
import { Avatar } from '@/components/avatar';
import { mainCategoriesInOrder } from '@/components/category-chips';
import { FeedMessage } from '@/components/feed-message';
import { FiltersSheet } from '@/components/filters-sheet';
import { ListingGrid } from '@/components/listing-grid';
import { PageTitle } from '@/components/page-title';
import { categoryName, useCategories } from '@/hooks/use-categories';
import { useListingsFeed } from '@/hooks/use-listings-feed';
import { useLanguage } from '@/i18n/language-provider';
import {
  activeFilterChips,
  NO_FILTERS,
  type SearchFilters,
  withoutFilter,
} from '@/search/filter-chips';
import { FontFiles, textStyleFor, useTokens } from '@/theme';
import { AppText, ArchFrame, Badge, DesignIcon, type DesignIconName } from '@/ui';
import { itemsCount } from '@/utils/count';

const TYPING_DELAY_MS = 500;

/** The design's icon for each main category (by its English name), as on Home. */
const CATEGORY_ICONS: Record<string, DesignIconName> = {
  Women: 'dress',
  Men: 'shirt',
  Kids: 'bear',
  Home: 'lamp',
  Electronics: 'phone',
};

/**
 * Browse: a search bar, then the categories as large tiles. Searching, tapping a
 * category or setting a filter shows the matching listings (and matching members).
 */
export default function BrowseScreen() {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language, direction } = useLanguage();
  const insets = useSafeAreaInsets();
  const { categories, reload: reloadCategories } = useCategories();

  const [query, setQuery] = useState(''); // what's in the search box
  const [search, setSearch] = useState(''); // what we actually search for
  const [filters, setFilters] = useState<SearchFilters>(NO_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [members, setMembers] = useState<PublicProfile[]>([]);

  // Opened from Home: ?q=<words> (the search box) or ?wilaya=<code> (my wilaya chip,
  // "Voir tout"). `at` changes on every tap, so the same search can be opened again.
  const params = useLocalSearchParams<{ q?: string; wilaya?: string; at?: string }>();
  useEffect(() => {
    if (!params.at) return;
    const words = params.q?.trim() ?? '';
    setQuery(words);
    setSearch(words);
    const wilaya = Number(params.wilaya);
    setFilters(Number.isInteger(wilaya) && wilaya > 0 ? { ...NO_FILTERS, wilaya } : NO_FILTERS);
  }, [params.at, params.q, params.wilaya]);

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

  // Round 46px buttons, cream with a thin border (like the bell in home.html).
  const roundButton = [styles.iconButton, { backgroundColor: tk.color.surface, borderColor: tk.color.border }];

  const searchBar = (
    <View style={[styles.topRow, { gap: 10 }]}>
      {showResults && (
        <Pressable
          onPress={backToCategories}
          accessibilityRole="button"
          accessibilityLabel={t('browse.backToCategories')}
          style={roundButton}>
          <DesignIcon name={direction === 'rtl' ? 'chevronRight' : 'chevronLeft'} size={20} color={tk.color.text} strokeWidth={1.9} />
        </Pressable>
      )}
      {/* The search box of home.html: 52 high, cream, thin border, corners 16 */}
      <View style={[styles.searchBox, { backgroundColor: tk.color.surface, borderColor: tk.color.border }]}>
        <DesignIcon name="search" size={19} color={tk.color.textSecondary} strokeWidth={1.8} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => setSearch(query.trim())}
          placeholder={t('browse.placeholder')}
          placeholderTextColor={tk.color.textSecondary}
          accessibilityLabel={t('browse.placeholder')}
          returnKeyType="search"
          autoCorrect={false}
          style={[
            textStyleFor('body', language === 'ar'),
            styles.searchInput,
            { color: tk.color.text, textAlign: direction === 'rtl' ? 'right' : 'left', writingDirection: direction },
          ]}
        />
        {query ? (
          <Pressable onPress={clearSearchText} accessibilityRole="button" accessibilityLabel={t('search.clearSearch')} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color={tk.color.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {showResults && (
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={chips.length ? t('search.filtersWithCount', { count: chips.length }) : t('search.filters')}
          style={[roundButton, chips.length ? { borderColor: tk.color.primary } : null]}>
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
    <View style={[styles.screen, { backgroundColor: tk.color.background, paddingTop: insets.top + 24 }]}>
      <View style={styles.titleBox}>
        <PageTitle title={t('tabs.search')} arabic={t('browse.titleArabic')} />
      </View>
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
            <View style={[styles.chips, { gap: 8 }]}>
              {chips.map((chip) => (
                <Pressable
                  key={chip.key}
                  onPress={() => setFilters(withoutFilter(filters, chip.key))}
                  accessibilityRole="button"
                  accessibilityLabel={t('search.removeFilter', { label: chip.label })}
                  hitSlop={{ top: 5, bottom: 5 }}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: pressed ? tk.color.borderStrong : tk.color.chip },
                  ]}>
                  <AppText variant="smallStrong" style={styles.chipText}>
                    {chip.label}
                  </AppText>
                  <Ionicons name="close" size={15} color={tk.color.text} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <ListingGrid
            feed={feed}
            onRetry={feed.retry}
            headerComponent={
              <View style={{ gap: tk.space.md, paddingHorizontal: 6 }}>
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
      contentContainerStyle={[styles.tiles, { maxWidth: tk.maxWidth }]}
      ListHeaderComponent={
        <AppText
          variant="subtitle"
          style={[styles.sectionTitle, { fontFamily: language === 'ar' ? FontFiles.arabicBold : FontFiles.serifBold }]}
          accessibilityRole="header">
          {t('browse.categories')}
        </AppText>
      }
      renderItem={({ item, index }) => (
        <View style={styles.tileCell}>
          {/* A cream card: the category's arch (soft tint + the design's icon), its names */}
          <Pressable
            onPress={() => onOpen(item)}
            accessibilityRole="button"
            accessibilityLabel={categoryName(item, language)}
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface, borderColor: tk.color.border },
            ]}>
            <ArchFrame width={64} height={72} color={tk.tints[index % tk.tints.length]} bottomRadius={14}>
              <View style={styles.center}>
                <DesignIcon name={CATEGORY_ICONS[item.name_en] ?? 'handbag'} size={28} color={tk.brand.ink} strokeWidth={1.4} />
              </View>
            </ArchFrame>
            <View style={{ gap: 2 }}>
              <AppText variant="bodyStrong" numberOfLines={2}>
                {categoryName(item, language)}
              </AppText>
              {language !== 'ar' && (
                <AppText variant="small" tone="secondary" numberOfLines={1}>
                  {item.name_ar}
                </AppText>
              )}
            </View>
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
                borderColor: tk.color.border,
                borderWidth: 1,
                borderRadius: 20,
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
  titleBox: { paddingHorizontal: 20, paddingBottom: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15, paddingVertical: 0 },
  iconButton: { width: 46, height: 46, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 21, lineHeight: 30, paddingHorizontal: 6, paddingBottom: 6 },
  chipText: { fontSize: 13 },
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
    paddingHorizontal: 20,
    paddingBottom: 8,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 13, borderRadius: 999 },
  tiles: { width: '100%', alignSelf: 'center', paddingHorizontal: 14, paddingBottom: 24 },
  tileCell: { width: '50%', padding: 6 },
  tile: { minHeight: 150, justifyContent: 'space-between', gap: 12, padding: 14, borderWidth: 1, borderRadius: 20 },
  member: { width: 112, alignItems: 'center' },
});
