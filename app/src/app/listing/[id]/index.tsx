import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { findConversationForListing, startConversation } from '@/api/conversations';
import {
  addFavorite,
  fetchListing,
  markListingSold,
  removeFavorite,
  type ListingDetail,
} from '@/api/listings';
import { useAuth } from '@/auth/auth-provider';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FeedMessage } from '@/components/feed-message';
import { MessageSheet } from '@/components/message-sheet';
import { PhotoCarousel } from '@/components/photo-carousel';
import { PhotoViewer } from '@/components/photo-viewer';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { wilayaLabel } from '@/constants/wilayas';
import { categoryName, useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import { formErrorsFrom } from '@/i18n/api-errors';
import { useLanguage } from '@/i18n/language-provider';
import { formatPrice } from '@/utils/format';
import { timeAgo } from '@/utils/time-ago';

const PHOTO_HEIGHT = 380;

type LoadState = 'loading' | 'ready' | 'notFound' | 'error';
/** Something the user tapped while logged out, to finish after they log in. */
type PendingAction = 'favorite' | 'message';

export default function ListingDetailsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, direction } = useLanguage();
  const { status: authStatus, user } = useAuth();
  const { categories } = useCategories();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string>();
  const [confirmSold, setConfirmSold] = useState(false);
  const [markingSold, setMarkingSold] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const [openingChat, setOpeningChat] = useState(false);
  const pending = useRef<PendingAction | null>(null);

  const signedIn = authStatus === 'signedIn';
  const isOwner = !!listing && !!user && listing.seller.id === user.id;
  const isSold = listing?.status === 'sold';
  const align = { textAlign: direction === 'rtl' ? 'right' : 'left', writingDirection: direction } as const;

  // Load (again when the user logs in or out: "is it in my favorites?" depends on it).
  const load = useCallback(async () => {
    setLoadState((current) => (current === 'ready' ? current : 'loading'));
    try {
      const data = await fetchListing(id, signedIn);
      setListing(data);
      setLoadState('ready');
    } catch (error) {
      setLoadState(error instanceof ApiError && error.status === 404 ? 'notFound' : 'error');
    }
  }, [id, signedIn]);

  useEffect(() => {
    if (authStatus !== 'loading') load();
  }, [load, authStatus]);

  const askToLogIn = (action: PendingAction) => {
    pending.current = action;
    router.push({ pathname: '/login', params: { next: `/listing/${id}` } } as Href);
  };

  const toggleFavorite = useCallback(
    async (target?: boolean) => {
      if (!listing) return;
      const wanted = target ?? !listing.is_favorited;
      if (wanted === listing.is_favorited) return;
      setActionError(undefined);
      setListing({ ...listing, is_favorited: wanted }); // show it straight away
      try {
        if (wanted) await addFavorite(listing.id);
        else await removeFavorite(listing.id);
      } catch {
        setListing((current) => (current ? { ...current, is_favorited: !wanted } : current));
        setActionError(t('listing.actionFailed'));
      }
    },
    [listing, t],
  );

  const openConversation = useCallback(async () => {
    if (!listing) return;
    setActionError(undefined);
    setOpeningChat(true);
    try {
      const existing = await findConversationForListing(listing.id);
      if (existing) router.push(`/chat/${existing}` as Href);
      else setMessageOpen(true);
    } catch {
      setActionError(t('listing.actionFailed'));
    } finally {
      setOpeningChat(false);
    }
  }, [listing, t]);

  // After logging in, finish what the user tapped (unless it turns out to be their own listing).
  useEffect(() => {
    if (!signedIn || !listing || !pending.current) return;
    const action = pending.current;
    pending.current = null;
    if (listing.seller.id === user?.id) return;
    if (action === 'favorite') toggleFavorite(true);
    if (action === 'message' && !isSold) openConversation();
  }, [signedIn, listing, user, isSold, toggleFavorite, openConversation]);

  const onHeart = () => (signedIn ? toggleFavorite() : askToLogIn('favorite'));
  const onMessage = () => (signedIn ? openConversation() : askToLogIn('message'));

  const sendFirstMessage = async (text: string) => {
    if (!listing) return;
    setSending(true);
    setSendError(undefined);
    try {
      const conversation = await startConversation(listing.id, text);
      setMessageOpen(false);
      router.push(`/chat/${conversation.id}` as Href);
    } catch (error) {
      const errors = formErrorsFrom(error, t, { text: 'text', listing: 'text' });
      setSendError(errors.fields.text ?? errors.general);
    } finally {
      setSending(false);
    }
  };

  const markSold = async () => {
    if (!listing) return;
    setMarkingSold(true);
    try {
      await markListingSold(listing.id);
      setListing({ ...listing, status: 'sold' });
      setConfirmSold(false);
    } catch {
      setConfirmSold(false);
      setActionError(t('listing.actionFailed'));
    } finally {
      setMarkingSold(false);
    }
  };

  const category = useMemo(
    () => categories.find((c) => c.id === listing?.category),
    [categories, listing?.category],
  );

  if (loadState === 'loading') {
    return <FeedMessage kind="loading" text={t('home.loading')} />;
  }
  if (loadState === 'notFound') {
    return <FeedMessage kind="message" icon="search-outline" text={t('listing.notFound')} />;
  }
  if (loadState === 'error' || !listing) {
    return (
      <FeedMessage
        kind="message"
        icon="cloud-offline-outline"
        text={t('home.error')}
        buttonLabel={t('home.retry')}
        onPress={load}
      />
    );
  }

  const details: [string, string][] = [
    [t('listing.size'), listing.size],
    [t('listing.brand'), listing.brand],
    [t('listing.condition'), t(`listing.conditions.${listing.condition}`)],
    [t('listing.category'), category ? categoryName(category, language) : listing.category_name],
    [t('listing.wilaya'), wilayaLabel(listing.wilaya, language)],
    [t('listing.posted'), timeAgo(listing.created_at, language)],
  ];

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.photoBox}>
          {listing.photos.length ? (
            <PhotoCarousel
              photos={listing.photos}
              height={PHOTO_HEIGHT}
              onPressPhoto={setViewerAt}
            />
          ) : (
            <View style={[styles.noPhoto, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="image-outline" size={48} color={theme.textSecondary} />
              <ThemedText themeColor="textSecondary">{t('listing.noPhotos')}</ThemedText>
            </View>
          )}
          {listing.status !== 'active' && (
            <View
              style={[
                styles.badge,
                // Top corner where reading starts: left in French/English, right in Arabic.
                direction === 'rtl' ? { right: Spacing.three } : { left: Spacing.three },
                isSold ? styles.badgeSold : styles.badgeReserved,
              ]}>
              <ThemedText type="smallBold" style={styles.badgeText}>
                {isSold ? t('listing.sold') : t('listing.reserved')}
              </ThemedText>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <ThemedText type="subtitle" style={align}>
            {formatPrice(listing.price_dzd, language)}
          </ThemedText>
          <ThemedText style={[styles.title, align]}>{listing.title}</ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            {details
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <View key={label} style={styles.detailRow}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {label}
                  </ThemedText>
                  <ThemedText
                    type="smallBold"
                    style={[
                      styles.detailValue,
                      // The value sits at the row's end: right in French/English, left in Arabic.
                      { textAlign: direction === 'rtl' ? 'left' : 'right' },
                    ]}>
                    {value}
                  </ThemedText>
                </View>
              ))}
          </ThemedView>

          <ThemedText type="smallBold" style={align}>
            {t('listing.description')}
          </ThemedText>
          <ThemedText
            themeColor={listing.description ? 'text' : 'textSecondary'}
            style={align}>
            {listing.description || t('listing.noDescription')}
          </ThemedText>

          <ThemedText type="smallBold" style={align}>
            {t('listing.seller')}
          </ThemedText>
          <ThemedView type="backgroundElement" style={[styles.card, styles.sellerCard]}>
            <View style={styles.avatar}>
              <ThemedText type="smallBold" style={styles.avatarText}>
                {listing.seller.display_name.trim().charAt(0).toUpperCase() || '?'}
              </ThemedText>
            </View>
            <View style={styles.flex}>
              <ThemedText type="smallBold" style={align}>
                {listing.seller.display_name}
              </ThemedText>
              {listing.seller.wilaya ? (
                <ThemedText type="small" themeColor="textSecondary" style={align}>
                  {wilayaLabel(listing.seller.wilaya, language)}
                </ThemedText>
              ) : null}
            </View>
          </ThemedView>

          {isSold && (
            <ThemedText themeColor="textSecondary" style={[styles.center, styles.soldNote]}>
              {isOwner ? t('listing.ownerSoldNotice') : t('listing.soldNotice')}
            </ThemedText>
          )}
        </View>
      </ScrollView>

      {/* Bottom bar with the actions */}
      <ThemedView
        style={[
          styles.actionBar,
          { borderTopColor: theme.backgroundSelected, paddingBottom: insets.bottom + Spacing.two },
        ]}>
        {actionError ? (
          <ThemedText type="small" style={[styles.actionError, styles.center]}>
            {actionError}
          </ThemedText>
        ) : null}
        <View style={styles.actionRow}>
          {isOwner ? (
            <>
              <View style={styles.flex}>
                <PrimaryButton
                  title={t('listing.edit')}
                  variant="secondary"
                  onPress={() => router.push(`/listing/${listing.id}/edit` as Href)}
                />
              </View>
              {!isSold && (
                <View style={styles.flex}>
                  <PrimaryButton
                    title={t('listing.markSold')}
                    variant="danger"
                    onPress={() => setConfirmSold(true)}
                  />
                </View>
              )}
            </>
          ) : (
            <>
              <HeartButton favorited={listing.is_favorited} onPress={onHeart} />
              {!isSold && (
                <View style={styles.flex}>
                  <PrimaryButton
                    title={t('listing.messageSeller')}
                    onPress={onMessage}
                    loading={openingChat}
                  />
                </View>
              )}
            </>
          )}
        </View>
      </ThemedView>

      <PhotoViewer photos={listing.photos} openAt={viewerAt} onClose={() => setViewerAt(null)} />
      <ConfirmDialog
        visible={confirmSold}
        title={t('listing.confirmSoldTitle')}
        message={t('listing.confirmSoldMessage')}
        confirmLabel={t('listing.confirmSold')}
        cancelLabel={t('listing.cancel')}
        onConfirm={markSold}
        onCancel={() => setConfirmSold(false)}
        loading={markingSold}
        danger
      />
      <MessageSheet
        visible={messageOpen}
        sellerName={listing.seller.display_name}
        sending={sending}
        error={sendError}
        onSend={sendFirstMessage}
        onCancel={() => {
          setMessageOpen(false);
          setSendError(undefined);
        }}
      />
    </ThemedView>
  );
}

/** The round ♡ button: filled red when the listing is in my favorites. */
function HeartButton({ favorited, onPress }: { favorited: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={favorited ? t('listing.removeFavorite') : t('listing.addFavorite')}
      accessibilityState={{ selected: favorited }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.circle,
        { backgroundColor: theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <Ionicons
        name={favorited ? 'heart' : 'heart-outline'}
        size={26}
        color={favorited ? '#E0245E' : theme.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  scroll: { paddingBottom: Spacing.five, width: '100%', maxWidth: 720, alignSelf: 'center' },
  photoBox: { height: PHOTO_HEIGHT },
  noPhoto: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  badge: {
    position: 'absolute',
    top: Spacing.three,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
  },
  badgeSold: { backgroundColor: '#D93025' },
  badgeReserved: { backgroundColor: '#E37400' },
  badgeText: { color: '#ffffff' },
  body: { padding: Spacing.four, gap: Spacing.three },
  title: { fontSize: 18 },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  detailValue: { flexShrink: 1 },
  sellerCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#208AEF',
  },
  avatarText: { color: '#ffffff', fontSize: 18 },
  soldNote: { marginTop: Spacing.two },
  actionBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  actionError: { color: '#D93025' },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
