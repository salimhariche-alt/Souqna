import { Image } from 'expo-image';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  deleteListing,
  fetchMyListings,
  MY_LISTING_TABS,
  setListingStatus,
  type ListingSummary,
  type MyListing,
  type MyListingTab,
} from '@/api/listings';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RequireAuth } from '@/components/require-auth';
import { useLanguage } from '@/i18n/language-provider';
import { useTokens } from '@/theme';
import { AppText, Badge, Button, Card, EmptyState, type BadgeTone } from '@/ui';
import { formatPrice } from '@/utils/format';

/** My listings: tabs Active / Under review / Reserved / Sold, with quick actions. */
function MyListingsContent() {
  const { t } = useTranslation();
  const tk = useTokens();
  const [tab, setTab] = useState<MyListingTab>('active');
  const [counts, setCounts] = useState<Record<MyListingTab, number> | null>(null);
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
      setCounts(data.counts);
      nextPage.current = data.next ? 2 : null;
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [tab]);

  // Load when shown, and again when coming back (e.g. after editing a listing).
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

  const tabs = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: tk.space.sm, paddingVertical: tk.space.sm }}>
      {MY_LISTING_TABS.map((name) => {
        const selected = tab === name;
        return (
          <Pressable
            key={name}
            onPress={() => {
              setItems(null);
              setTab(name);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.tab, { borderRadius: tk.radius.full, backgroundColor: selected ? tk.color.primary : tk.color.surface }]}>
            <AppText variant="smallStrong" style={{ color: selected ? tk.color.onPrimary : tk.color.text }}>
              {t(`profile.tabs.${name}`)}
              {counts ? ` (${counts[name]})` : ''}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={[styles.flex, { backgroundColor: tk.color.background }]}>
      <FlatList
        data={items ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.list, { padding: tk.space.lg, gap: tk.space.md, maxWidth: tk.maxWidth }]}
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
            {tabs}
            {actionError ? (
              <AppText variant="small" tone="danger" align="center">
                {actionError}
              </AppText>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          items === null ? (
            failed ? (
              <EmptyState icon="cloud-offline-outline" title={t('home.error')} actionLabel={t('home.retry')} onAction={load} />
            ) : (
              <ActivityIndicator style={{ marginTop: tk.space.xxl }} />
            )
          ) : (
            <EmptyState
              icon="pricetags-outline"
              title={t(`profile.empty.${tab}`)}
              actionLabel={tab === 'active' ? t('profile.sellSomething') : undefined}
              onAction={tab === 'active' ? () => router.navigate('/sell') : undefined}
            />
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
        onConfirm={() => {
          const listing = toDelete;
          setToDelete(null);
          if (listing) run(listing, () => deleteListing(listing.id));
        }}
        onCancel={() => setToDelete(null)}
        danger
      />
    </View>
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
  const tk = useTokens();
  const { language } = useLanguage();
  const underReview = listing.review_status !== 'approved';

  const [statusLabel, statusTone]: [string, BadgeTone] = underReview
    ? listing.review_status === 'rejected'
      ? [t('listing.rejectedTitle'), 'danger']
      : [t('listing.underReviewTitle'), 'warning']
    : listing.status === 'sold'
      ? [t('profile.status.sold'), 'neutral']
      : listing.status === 'reserved'
        ? [t('profile.status.reserved'), 'warning']
        : [t('profile.status.active'), 'success'];

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

  return (
    <Card>
      <Pressable
        onPress={() => router.push(`/listing/${listing.id}` as Href)}
        accessibilityRole="button"
        accessibilityLabel={listing.title}
        style={[styles.rowTop, { gap: tk.space.md }]}>
        {listing.cover_photo ? (
          <Image source={{ uri: listing.cover_photo }} style={[styles.photo, { borderRadius: tk.radius.md }]} contentFit="cover" />
        ) : (
          <View style={[styles.photo, { borderRadius: tk.radius.md, backgroundColor: tk.color.surfaceAlt }]} />
        )}
        <View style={[styles.flex, { gap: tk.space.xs }]}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {listing.title}
          </AppText>
          <AppText variant="small" tone="secondary">
            {formatPrice(listing.price_dzd, language)}
          </AppText>
          <Badge label={statusLabel} tone={statusTone} />
        </View>
        {busy && <ActivityIndicator />}
      </Pressable>
      {underReview && (
        <AppText variant="small" tone="secondary">
          {listing.review_status === 'rejected' ? t('listing.rejectedText') : t('listing.underReviewText')}
        </AppText>
      )}
      <View style={[styles.actions, { gap: tk.space.sm }]}>
        {actions.map((action) => (
          <View key={action.label}>
            <Button
              title={action.label}
              onPress={action.onPress}
              variant="outlined"
              tone={action.danger ? 'danger' : 'brand'}
              size="sm"
              fullWidth={false}
              disabled={busy}
            />
          </View>
        ))}
      </View>
    </Card>
  );
}

export default function MyListingsScreen() {
  return (
    <RequireAuth next="/my-listings">
      <MyListingsContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { width: '100%', alignSelf: 'center', flexGrow: 1 },
  tab: { paddingVertical: 8, paddingHorizontal: 16 },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  photo: { width: 72, height: 72 },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
});
