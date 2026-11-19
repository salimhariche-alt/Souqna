import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { fetchListings, type Category, type ListingSummary } from '@/api/listings';
import { useAuth } from '@/auth/auth-provider';
import { BetaLabel } from '@/components/beta-label';
import { mainCategoriesInOrder } from '@/components/category-chips';
import { FeedMessage } from '@/components/feed-message';
import { WILAYAS } from '@/constants/wilayas';
import { categoryName, useCategories } from '@/hooks/use-categories';
import { useFavoriteIds } from '@/hooks/use-favorite-ids';
import { useListingsFeed } from '@/hooks/use-listings-feed';
import type { Language } from '@/i18n';
import { useLanguage } from '@/i18n/language-provider';
import { useNotificationsUnread } from '@/messages/notifications-unread';
import { FontFiles, textStyleFor, useTokens } from '@/theme';
import { AppText, ArchFrame, DesignIcon, type DesignIconName, Logo, TriangleBand } from '@/ui';
import { formatPrice } from '@/utils/format';

/** Soft tints behind photos and category arches, in the design's order. */
const TINTS = ['#F0D9C4', '#D9E3EE', '#EBDDB3', '#DDE3CC', '#E8D6D0'] as const;

/** The design's icon for each category (by its English name). */
const CATEGORY_ICONS: Record<string, DesignIconName> = {
  Women: 'dress',
  Men: 'shirt',
  Kids: 'bear',
  Home: 'lamp',
  Electronics: 'phone',
};

const PAD = 20; // the design's side padding

/** "Oran" (French/English) or "وهران" (Arabic). */
function wilayaName(code: number | null | undefined, language: Language) {
  const wilaya = WILAYAS.find((w) => w.code === code);
  if (!wilaya) return null;
  return language === 'ar' ? wilaya.ar : wilaya.fr;
}

/** "Oran · وهران" (French/English) or "وهران" (Arabic) - for screen readers. */
function wilayaTwoScripts(code: number | null | undefined, language: Language) {
  const wilaya = WILAYAS.find((w) => w.code === code);
  if (!wilaya) return null;
  return language === 'ar' ? wilaya.ar : `${wilaya.fr} · ${wilaya.ar}`;
}

/** Fonts that work in both scripts: Arabic text must never use Fraunces / DM Sans. */
const fontFor = (language: Language, latin: string, arabic: string) => (language === 'ar' ? arabic : latin);

/**
 * Home - exactly as docs/inspiration/warm-local/home.html, with real data:
 * greeting + logo + bell (opens Messages), search, my wilaya, the Kabyle band, the
 * categories in arches, "Près de chez vous" (listings in my wilaya) and "Les bonnes
 * affaires du souk" (every listing, 2 columns, more as you scroll).
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const tk = useTokens();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { language } = useLanguage();
  const { user, status } = useAuth();
  const { categories: allCategories, reload: loadCategories } = useCategories();
  const categories = useMemo(() => mainCategoriesInOrder(allCategories), [allCategories]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const feed = useListingsFeed({ category: categoryId });
  const favorites = useFavoriteIds();

  // The grid: 2 columns, 12 apart, inside the 20px side padding (max 720 wide).
  const contentWidth = Math.min(width, 720);
  const cardWidth = (contentWidth - PAD * 2 - 12) / 2;

  const toggleFavorite = (listing: ListingSummary) => {
    if (status !== 'signedIn') {
      router.push({ pathname: '/login', params: { next: '/' } } as Href);
      return;
    }
    favorites.toggle(listing.id);
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 22 }]}>
      <TopBar name={user?.display_name} />
      <SearchAndWilaya wilaya={user?.wilaya ?? null} language={language} />
      <TriangleBand height={14} size={14} peak={2} accentColor={tk.brand.casbah} />
      <CategoryRow
        categories={categories}
        selected={categoryId}
        onSelect={(id) => setCategoryId((current) => (current === id ? null : id))}
        language={language}
      />
      {user?.wilaya ? <NearYou wilaya={user.wilaya} language={language} /> : null}
      <View style={styles.padded}>
        <AppText
          variant="subtitle"
          style={[styles.sectionTitle, { fontFamily: fontFor(language, FontFiles.serifBold, FontFiles.arabicBold) }]}
          accessibilityRole="header">
          {t('home.deals')}
        </AppText>
      </View>
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: tk.color.background }}
      data={feed.status === 'ready' ? feed.items : []}
      keyExtractor={(item) => String(item.id)}
      numColumns={2}
      columnWrapperStyle={[styles.columns, { paddingHorizontal: (width - contentWidth) / 2 + PAD }]}
      contentContainerStyle={{ paddingBottom: 32 }}
      ListHeaderComponent={header}
      renderItem={({ item, index }) => (
        <DealCard
          listing={item}
          width={cardWidth}
          tint={TINTS[index % 4]}
          liked={favorites.isFavorite(item.id)}
          onToggleLike={() => toggleFavorite(item)}
          language={language}
        />
      )}
      onEndReached={feed.loadMore}
      onEndReachedThreshold={0.6}
      refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.refresh} />}
      ListEmptyComponent={
        feed.status === 'loading' ? (
          <ActivityIndicator style={styles.loading} color={tk.color.primary} />
        ) : feed.status === 'error' ? (
          <FeedMessage
            kind="message"
            icon="cloud-offline-outline"
            text={t('home.error')}
            buttonLabel={t('home.retry')}
            onPress={() => {
              feed.retry();
              if (categories.length === 0) loadCategories();
            }}
          />
        ) : (
          <FeedMessage
            kind="message"
            icon="pricetags-outline"
            text={categoryId ? t('home.emptyCategory') : t('home.empty')}
          />
        )
      }
      ListFooterComponent={
        feed.loadingMore ? <ActivityIndicator style={styles.loading} color={tk.color.primary} /> : undefined
      }
    />
  );
}

/** "Marhba bik, Salim" + the logo, and the round bell (opens Notifications). */
function TopBar({ name }: { name?: string }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const unread = useNotificationsUnread();
  return (
    <View style={[styles.row, styles.padded, styles.spaceBetween]}>
      <View style={styles.greeting}>
        <View style={[styles.row, { gap: 8 }]}>
          <AppText variant="small" tone="secondary" numberOfLines={1} style={styles.flexShrink}>
            {name ? t('home.greeting', { name }) : t('home.greetingNoName')}
          </AppText>
          <BetaLabel />
        </View>
        <Logo size={30} />
      </View>
      <Pressable
        onPress={() => router.push('/notifications' as Href)}
        accessibilityRole="button"
        accessibilityLabel={
          unread > 0 ? t('delivery.notificationsUnread', { count: unread }) : t('delivery.notificationsA11y')
        }
        style={({ pressed }) => [
          styles.bell,
          { backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface, borderColor: tk.color.border },
        ]}>
        <DesignIcon name="bell" size={20} color={tk.color.text} strokeWidth={1.7} />
        {unread > 0 && <View style={[styles.dot, { backgroundColor: tk.color.primary }]} />}
      </Pressable>
    </View>
  );
}

/** The search box (opens Explorer with the words) and my wilaya chip. */
function SearchAndWilaya({ wilaya, language }: { wilaya: number | null; language: Language }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const [query, setQuery] = useState('');
  const wilayaText = wilayaTwoScripts(wilaya, language);
  const wilayaInfo = WILAYAS.find((w) => w.code === wilaya);
  const search = () => {
    const words = query.trim();
    if (!words) return;
    router.navigate({ pathname: '/search', params: { q: words, at: String(Date.now()) } } as Href);
  };
  return (
    <View style={[styles.padded, { gap: 10 }]}>
      <View style={[styles.searchBox, { backgroundColor: tk.color.surface, borderColor: tk.color.border }]}>
        <DesignIcon name="search" size={19} color={tk.color.textSecondary} strokeWidth={1.8} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
          placeholder={t('home.searchPlaceholder')}
          placeholderTextColor={tk.color.textSecondary}
          accessibilityLabel={t('home.searchLabel')}
          style={[
            textStyleFor('body', language === 'ar'),
            styles.searchInput,
            { color: tk.color.text, textAlign: language === 'ar' ? 'right' : 'left' },
          ]}
        />
      </View>
      {wilayaText ? (
        <Pressable
          onPress={() =>
            router.navigate({ pathname: '/search', params: { wilaya: String(wilaya), at: String(Date.now()) } } as Href)
          }
          accessibilityRole="button"
          accessibilityLabel={t('home.wilayaChip', { wilaya: wilayaText })}
          hitSlop={{ top: 5, bottom: 5 }}
          style={({ pressed }) => [
            styles.wilayaChip,
            { backgroundColor: pressed ? tk.color.borderStrong : tk.color.chip },
          ]}>
          <DesignIcon name="pin" size={14} color={tk.color.text} strokeWidth={1.8} />
          {/* "Oran · " in DM Sans 500, "وهران" in Noto Naskh Arabic (as in the design). */}
          <Text style={[styles.chipText, { color: tk.color.text }]} numberOfLines={1}>
            {language !== 'ar' && wilayaInfo ? `${wilayaInfo.fr} · ` : ''}
            <Text style={styles.chipArabic}>{wilayaInfo?.ar}</Text>
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The categories: an arch (64 x 72) with the icon, the name, and the Arabic name. */
function CategoryRow({
  categories,
  selected,
  onSelect,
  language,
}: {
  categories: Category[];
  selected: number | null;
  onSelect: (id: number) => void;
  language: Language;
}) {
  const tk = useTokens();
  if (categories.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.padded, { gap: 12 }]}>
      {categories.map((category, i) => {
        const isSelected = selected === category.id;
        const name = categoryName(category, language);
        return (
          <Pressable
            key={category.id}
            onPress={() => onSelect(category.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={name}
            style={({ pressed }) => [styles.category, { opacity: pressed ? 0.8 : 1 }]}>
            <ArchFrame
              width={64}
              height={72}
              color={TINTS[i % TINTS.length]}
              bottomRadius={14}
              borderWidth={2}
              borderColor={isSelected ? tk.color.primary : 'transparent'}>
              <View style={styles.center}>
                <DesignIcon
                  name={CATEGORY_ICONS[category.name_en] ?? 'handbag'}
                  size={28}
                  color={tk.brand.ink}
                  strokeWidth={1.4}
                />
              </View>
            </ArchFrame>
            <Text
              style={[
                styles.categoryLabel,
                { color: tk.color.text, fontFamily: language === 'ar' ? FontFiles.arabicBold : FontFiles.bold },
              ]}
              numberOfLines={1}>
              {name}
            </Text>
            {language !== 'ar' && (
              <Text style={[styles.categoryArabic, { color: tk.color.textSecondary }]} numberOfLines={1}>
                {category.name_ar}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** "Près de chez vous": listings in my wilaya, as 150 x 190 arches in a row. */
function NearYou({ wilaya, language }: { wilaya: number; language: Language }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const [items, setItems] = useState<ListingSummary[]>([]);

  useEffect(() => {
    let current = true;
    fetchListings({ page: 1, filters: { wilaya } })
      .then((page) => current && setItems(page.results.slice(0, 10)))
      .catch(() => current && setItems([]));
    return () => {
      current = false;
    };
  }, [wilaya]);

  if (items.length === 0) return null;
  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.row, styles.padded, styles.spaceBetween, { alignItems: 'flex-end' }]}>
        <View>
          <AppText
            variant="subtitle"
            style={[styles.sectionTitle, { fontFamily: fontFor(language, FontFiles.serifBold, FontFiles.arabicBold) }]}
            accessibilityRole="header">
            {t('home.nearYou')}
          </AppText>
          {language !== 'ar' && (
            <AppText variant="small" tone="secondary" style={styles.arabicSub}>
              {t('home.nearYouArabic')}
            </AppText>
          )}
        </View>
        <Pressable
          onPress={() =>
            router.navigate({ pathname: '/search', params: { wilaya: String(wilaya), at: String(Date.now()) } } as Href)
          }
          accessibilityRole="button"
          hitSlop={12}>
          <AppText
            variant="smallStrong"
            style={[
              styles.seeAll,
              { color: tk.color.primary, fontFamily: fontFor(language, FontFiles.bold, FontFiles.arabicBold) },
            ]}>
            {t('home.seeAll')}
          </AppText>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.padded, { gap: 14 }]}>
        {items.map((listing, i) => (
          <Pressable
            key={listing.id}
            onPress={() => router.push(`/listing/${listing.id}` as Href)}
            accessibilityRole="button"
            accessibilityLabel={`${listing.title}, ${formatPrice(listing.price_dzd, language)}`}
            style={({ pressed }) => [styles.nearCard, { opacity: pressed ? 0.85 : 1 }]}>
            <ArchFrame width={150} height={190} color={TINTS[[0, 2, 1][i % 3]]} bottomRadius={18}>
              <PhotoOrIcon uri={listing.cover_photo} size={50} />
            </ArchFrame>
            <PriceBlock listing={listing} language={language} meta={wilayaName(listing.wilaya, language)} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** One card of "Les bonnes affaires": photo (corners 14) with a heart, price, title, details. */
function DealCard({
  listing,
  width,
  tint,
  liked,
  onToggleLike,
  language,
}: {
  listing: ListingSummary;
  width: number;
  tint: string;
  liked: boolean;
  onToggleLike: () => void;
  language: Language;
}) {
  const { t } = useTranslation();
  const tk = useTokens();
  const details = [listing.size, listing.condition ? t(`listing.conditions.${listing.condition}`) : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[styles.dealCard, { width, backgroundColor: tk.color.surface, borderColor: tk.color.border }]}>
      <View>
        <Pressable
          onPress={() => router.push(`/listing/${listing.id}` as Href)}
          accessibilityRole="button"
          accessibilityLabel={`${listing.title}, ${formatPrice(listing.price_dzd, language)}`}
          style={[styles.dealPhoto, { backgroundColor: tint }]}>
          <PhotoOrIcon uri={listing.cover_photo} size={54} />
          {listing.status !== 'active' && (
            <View style={[styles.statusPill, { backgroundColor: tk.color.text }]}>
              <AppText variant="caption" style={{ color: tk.color.surface }}>
                {listing.status === 'sold' ? t('listing.sold') : t('listing.reserved')}
              </AppText>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={onToggleLike}
          accessibilityRole="button"
          accessibilityState={{ selected: liked }}
          accessibilityLabel={liked ? t('home.removeFavorite') : t('home.addFavorite')}
          style={styles.heart}>
          <DesignIcon
            name="heart"
            size={18}
            strokeWidth={1.8}
            color={liked ? tk.color.primary : tk.brand.ink}
            fill={liked ? tk.color.primary : 'none'}
          />
        </Pressable>
      </View>
      <Pressable
        onPress={() => router.push(`/listing/${listing.id}` as Href)}
        accessible={false}
        style={styles.dealText}>
        <PriceBlock listing={listing} language={language} meta={details} />
      </Pressable>
    </View>
  );
}

/** Price (Fraunces 17, terracotta), title (13) and a grey line (12). */
function PriceBlock({ listing, language, meta }: { listing: ListingSummary; language: Language; meta?: string | null }) {
  const tk = useTokens();
  return (
    <View style={{ gap: 1 }}>
      <Text
        style={[
          styles.price,
          { color: tk.color.primary, fontFamily: language === 'ar' ? FontFiles.arabicBold : FontFiles.serifBold },
        ]}
        numberOfLines={1}>
        {formatPrice(listing.price_dzd, language)}
      </Text>
      <AppText variant="small" numberOfLines={1} style={styles.itemTitle}>
        {listing.title}
      </AppText>
      {meta ? (
        <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.meta}>
          {meta}
        </AppText>
      ) : null}
    </View>
  );
}

/** The listing's photo, or the design's bag icon while there is none. */
function PhotoOrIcon({ uri, size }: { uri: string | null; size: number }) {
  const tk = useTokens();
  if (uri) {
    return <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />;
  }
  return (
    <View style={styles.center}>
      <DesignIcon name="bag" size={size} color={tk.brand.inkSoft} strokeWidth={1.1} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 20, paddingBottom: 12 },
  padded: { paddingHorizontal: PAD },
  row: { flexDirection: 'row', alignItems: 'center' },
  spaceBetween: { justifyContent: 'space-between' },
  flexShrink: { flexShrink: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  greeting: { gap: 2, flexShrink: 1 },
  bell: {
    width: 46,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { position: 'absolute', top: 10, right: 11, width: 9, height: 9, borderRadius: 5 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 16,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15, paddingVertical: 0 },
  wilayaChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  chipText: { fontFamily: FontFiles.medium, fontSize: 13, lineHeight: 18 },
  chipArabic: { fontFamily: FontFiles.arabic },
  category: { alignItems: 'center', gap: 5 },
  categoryLabel: { fontSize: 13, lineHeight: 17 },
  categoryArabic: { fontFamily: FontFiles.arabic, fontSize: 12, lineHeight: 16 },
  sectionTitle: { fontSize: 21, lineHeight: 30 },
  arabicSub: { fontSize: 13, lineHeight: 20 },
  seeAll: { fontSize: 14 },
  nearCard: { width: 150, gap: 8 },
  columns: { gap: 12, marginBottom: 18 },
  dealCard: { gap: 8, padding: 8, borderWidth: 1, borderRadius: 20 },
  dealPhoto: { height: 178, borderRadius: 14, overflow: 'hidden' },
  statusPill: { position: 'absolute', left: 8, bottom: 8, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  heart: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: 'rgba(255,251,245,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealText: { paddingHorizontal: 4, paddingBottom: 4 },
  price: { fontSize: 17, lineHeight: 22 },
  itemTitle: { fontSize: 13, lineHeight: 18 },
  meta: { fontSize: 12, lineHeight: 16 },
  loading: { marginVertical: 24 },
});
