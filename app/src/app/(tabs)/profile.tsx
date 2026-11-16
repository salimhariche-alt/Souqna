import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useFocusEffect, type Href } from 'expo-router';
import { type ComponentProps, useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  deleteListing,
  fetchFavorites,
  fetchMyListings,
  MY_LISTING_TABS,
  removeFavorite,
  setListingStatus,
  type ListingSummary,
  type MyListing,
  type MyListingTab,
} from '@/api/listings';
import { useAuth } from '@/auth/auth-provider';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FeedMessage } from '@/components/feed-message';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ListingGrid } from '@/components/listing-grid';
import { PrimaryButton } from '@/components/primary-button';
import { ProfileHeader } from '@/components/profile-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { useListingsFeed } from '@/hooks/use-listings-feed';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language-provider';
import { formatPrice } from '@/utils/format';

type IconName = ComponentProps<typeof Ionicons>['name'];
const NO_FILTERS = {};

/** Logged out: a friendly welcome. */
function Welcome() {
  const { t } = useTranslation();
  return (
    <ScrollView contentContainerStyle={styles.welcome}>
      <View style={styles.welcomeIcon}>
        <Ionicons name="person-circle-outline" size={72} color={Brand.fill} />
      </View>
      <ThemedText type="subtitle" style={styles.center}>
        {t('profile.welcomeTitle')}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.center}>
        {t('profile.welcomeText')}
      </ThemedText>
      <PrimaryButton
        title={t('auth.loginButton')}
        onPress={() => router.push({ pathname: '/login', params: { next: '/profile' } } as Href)}
      />
      <PrimaryButton
        title={t('auth.goToSignup')}
        variant="secondary"
        onPress={() => router.push({ pathname: '/signup', params: { next: '/profile' } } as Href)}
      />
      <LanguageSwitcher />
      {/* Development only: the design system preview (brand colour options). */}
      {__DEV__ && (
        <PrimaryButton
          title={t('designPreview.screenTitle')}
          variant="secondary"
          onPress={() => router.push('/design-preview' as Href)}
        />
      )}
    </ScrollView>
  );
}

/** A row like "Edit profile  >". */
function MenuRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const theme = useTheme();
  const { direction } = useLanguage();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.menuRow, { backgroundColor: theme.backgroundElement }, pressed && styles.pressed]}>
      <Ionicons name={icon} size={22} color={theme.text} />
      <ThemedText style={styles.flex}>{label}</ThemedText>
      <Ionicons
        name={direction === 'rtl' ? 'chevron-back' : 'chevron-forward'}
        size={18}
        color={theme.textSecondary}
      />
    </Pressable>
  );
}

/** Selectable chip (segments and tabs). */
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={[styles.chip, { backgroundColor: selected ? Brand.fill : theme.backgroundElement }]}>
      <ThemedText type="smallBold" style={selected ? styles.chipTextSelected : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function ProfileHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [section, setSection] = useState<'mine' | 'favorites'>('mine');
  const [tab, setTab] = useState<MyListingTab>('active');
  const [counts, setCounts] = useState<Record<MyListingTab, number> | null>(null);

  if (!user) return null;

  const header = (
    <View style={styles.header}>
      <ProfileHeader
        name={user.display_name}
        avatar={user.avatar}
        wilaya={user.wilaya}
        phoneVerified={user.phone_verified}
        memberSince={user.date_joined}
        itemsSold={user.items_sold}
        notVerifiedSlot={
          <Pressable
            onPress={() =>
              router.push({ pathname: '/verify-phone', params: { next: '/profile' } } as Href)
            }
            accessibilityRole="button"
            style={styles.verifyButton}>
            <Ionicons name="alert-circle-outline" size={16} color="#B06000" />
            <ThemedText type="smallBold" style={styles.verifyText}>
              {t('profile.verifyNow')}
            </ThemedText>
          </Pressable>
        }
      />
      <MenuRow icon="create-outline" label={t('profile.editProfile')} onPress={() => router.push('/edit-profile' as Href)} />
      <MenuRow icon="settings-outline" label={t('settings.title')} onPress={() => router.push('/settings' as Href)} />

      <View style={styles.segments} accessibilityRole="tablist">
        <Chip label={t('profile.myListings')} selected={section === 'mine'} onPress={() => setSection('mine')} />
        <Chip label={t('profile.myFavorites')} selected={section === 'favorites'} onPress={() => setSection('favorites')} />
      </View>
      {section === 'mine' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {MY_LISTING_TABS.map((name) => (
            <Chip
              key={name}
              label={`${t(`profile.tabs.${name}`)}${counts ? ` (${counts[name]})` : ''}`}
              selected={tab === name}
              onPress={() => setTab(name)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );

  return section === 'mine' ? (
    <MyListings tab={tab} header={header} onCounts={setCounts} />
  ) : (
    <Favorites header={header} />
  );
}

/** Profile -> My listings (one tab), with quick actions on each. */
function MyListings({
  tab,
  header,
  onCounts,
}: {
  tab: MyListingTab;
  header: React.ReactElement;
  onCounts: (counts: Record<MyListingTab, number>) => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<MyListing[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string>();
  const [toDelete, setToDelete] = useState<MyListing | null>(null);
  const nextPage = useRef<number | null>(null);
  const loadingMore = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchMyListings(tab, 1);
      setItems(data.results);
      onCounts(data.counts);
      nextPage.current = data.next ? 2 : null;
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [tab, onCounts]);

  // Load when shown, again when coming back (e.g. after editing a listing).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const loadMore = async () => {
    if (!nextPage.current || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const data = await fetchMyListings(tab, nextPage.current);
      setItems((current) => {
        const known = new Set(current?.map((i) => i.id));
        return [...(current ?? []), ...data.results.filter((i) => !known.has(i.id))];
      });
      nextPage.current = data.next ? nextPage.current + 1 : null;
    } catch {
      // scroll again to retry
    } finally {
      loadingMore.current = false;
    }
  };

  const run = async (listing: MyListing, action: () => Promise<unknown>) => {
    setBusyId(listing.id);
    setActionError(undefined);
    try {
      await action();
      await load();
    } catch {
      setActionError(t('listing.actionFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const listing = toDelete;
    setToDelete(null);
    await run(listing, () => deleteListing(listing.id));
  };

  return (
    <>
      <FlatList
        data={items ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await load();
          setRefreshing(false);
        }}
        ListHeaderComponent={
          <View>
            {header}
            {actionError ? (
              <ThemedText type="small" style={[styles.error, styles.center]}>
                {actionError}
              </ThemedText>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          items === null ? (
            failed ? (
              <FeedMessage kind="message" icon="cloud-offline-outline" text={t('home.error')} buttonLabel={t('home.retry')} onPress={load} />
            ) : (
              <ActivityIndicator style={styles.loading} />
            )
          ) : (
            <View style={styles.empty}>
              <ThemedText themeColor="textSecondary" style={styles.center}>
                {t(`profile.empty.${tab}`)}
              </ThemedText>
              {tab === 'active' && (
                <PrimaryButton title={t('profile.sellSomething')} onPress={() => router.navigate('/sell')} />
              )}
            </View>
          )
        }
        renderItem={({ item }) => (
          <MyListingRow
            listing={item}
            busy={busyId === item.id}
            onSetStatus={(status) => run(item, () => setListingStatus(item.id, status))}
            onDelete={() => setToDelete(item)}
          />
        )}
      />
      <ConfirmDialog
        visible={toDelete !== null}
        title={t('profile.deleteListingTitle')}
        message={t('profile.deleteListingText', { title: toDelete?.title ?? '' })}
        confirmLabel={t('profile.deleteListing')}
        cancelLabel={t('listing.cancel')}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
        danger
      />
    </>
  );
}

function MyListingRow({
  listing,
  busy,
  onSetStatus,
  onDelete,
}: {
  listing: MyListing;
  busy: boolean;
  onSetStatus: (status: ListingSummary['status']) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { language, direction } = useLanguage();
  const align = { textAlign: direction === 'rtl' ? 'right' : 'left' } as const;
  const underReview = listing.review_status !== 'approved';

  const actions: { label: string; onPress: () => void; danger?: boolean }[] = [
    { label: t('listing.edit'), onPress: () => router.push(`/listing/${listing.id}/edit` as Href) },
  ];
  if (!underReview && listing.status === 'active') {
    actions.push({ label: t('profile.markReserved'), onPress: () => onSetStatus('reserved') });
  }
  if (!underReview && listing.status === 'reserved') {
    actions.push({ label: t('profile.backOnSale'), onPress: () => onSetStatus('active') });
  }
  if (!underReview && listing.status !== 'sold') {
    actions.push({ label: t('profile.markSold'), onPress: () => onSetStatus('sold') });
  }
  actions.push({ label: t('profile.deleteListing'), onPress: onDelete, danger: true });

  const status = underReview
    ? listing.review_status === 'rejected'
      ? t('listing.rejectedTitle')
      : t('listing.underReviewTitle')
    : t(`profile.status.${listing.status}`);

  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <Pressable
        onPress={() => router.push(`/listing/${listing.id}` as Href)}
        accessibilityRole="button"
        style={styles.rowTop}>
        {listing.cover_photo ? (
          <Image source={{ uri: listing.cover_photo }} style={styles.rowPhoto} contentFit="cover" />
        ) : (
          <View style={[styles.rowPhoto, { backgroundColor: theme.backgroundSelected }]} />
        )}
        <View style={styles.flex}>
          <ThemedText type="smallBold" style={align} numberOfLines={1}>
            {listing.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={align}>
            {formatPrice(listing.price_dzd, language)}
          </ThemedText>
          <ThemedText type="small" style={[align, underReview ? styles.reviewText : styles.statusText]}>
            {status}
          </ThemedText>
        </View>
        {busy && <ActivityIndicator />}
      </Pressable>
      {underReview && (
        <ThemedText type="small" themeColor="textSecondary" style={align}>
          {listing.review_status === 'rejected' ? t('listing.rejectedText') : t('listing.underReviewText')}
        </ThemedText>
      )}
      <View style={styles.actions}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.action, { backgroundColor: theme.backgroundSelected }, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={action.danger ? styles.error : undefined}>
              {action.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>
    </ThemedView>
  );
}

/** Profile -> My favourites: the same grid as Home, with a heart to remove each. */
function Favorites({ header }: { header: React.ReactElement }) {
  const { t } = useTranslation();
  const feed = useListingsFeed(NO_FILTERS, fetchFavorites);
  const [removed, setRemoved] = useState<Set<number>>(() => new Set());

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
    <ListingGrid
      feed={feed}
      headerComponent={header}
      onUnfavorite={unfavorite}
      hiddenIds={removed}
      emptyComponent={
        <View style={styles.empty}>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {t('profile.noFavorites')}
          </ThemedText>
        </View>
      }
    />
  );
}

export default function ProfileScreen() {
  const { status } = useAuth();
  if (status === 'loading') return <ActivityIndicator style={styles.loading} />;
  return (
    <ThemedView style={styles.flex}>{status === 'signedIn' ? <ProfileHome /> : <Welcome />}</ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  pressed: { opacity: 0.6 },
  loading: { marginTop: Spacing.five },
  welcome: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    alignItems: 'stretch',
  },
  welcomeIcon: { alignItems: 'center', marginTop: Spacing.four },
  header: { gap: Spacing.two, paddingHorizontal: Spacing.two, paddingBottom: Spacing.two },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    backgroundColor: '#FFF4E0',
  },
  verifyText: { color: '#B06000' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  segments: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  tabs: { gap: Spacing.two, paddingVertical: Spacing.one },
  chip: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: 999 },
  chipTextSelected: { color: '#ffffff' },
  list: {
    padding: Spacing.two,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    flexGrow: 1,
  },
  empty: { padding: Spacing.four, gap: Spacing.three },
  row: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  rowPhoto: { width: 64, height: 64, borderRadius: Spacing.two },
  statusText: { color: '#1E8E3E' },
  reviewText: { color: '#8A5300' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  action: { paddingVertical: Spacing.one + 2, paddingHorizontal: Spacing.three, borderRadius: 999 },
  error: { color: '#D93025' },
});
