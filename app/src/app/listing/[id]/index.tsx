import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
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
import { blockUser } from '@/api/safety';
import { MessageSheet } from '@/components/message-sheet';
import { MoreButton, OptionsMenu, type MenuOption } from '@/components/options-menu';
import { ReportSheet } from '@/components/report-sheet';
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
import { soldCount } from '@/utils/count';
import { monthYear } from '@/utils/dates';
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

  // Every time the screen is shown: also after coming back from "Edit".
  useFocusEffect(
    useCallback(() => {
      if (authStatus !== 'loading') load();
    }, [load, authStatus]),
  );

  const askToLogIn = (action: PendingAction) => {
    pending.current = action;
    router.push({ pathname: '/login', params: { next: `/listing/${id}` } } as Href);
  };

  // Messaging needs a verified phone: open the verification screen, then continue.
  const verifyAsked = useRef(false);
  const askToVerify = useCallback(() => {
    pending.current = 'message';
    verifyAsked.current = true;
    router.push({ pathname: '/verify-phone', params: { next: `/listing/${id}` } } as Href);
  }, [id]);

  // Before the very first conversation: the "Buy safely" tips (once, then never again).
  const tipsAsked = useRef(false);
  const askToReadTips = useCallback(() => {
    pending.current = 'message';
    tipsAsked.current = true;
    router.push('/buy-safely' as Href);
  }, []);

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

  // After logging in (or verifying the phone), finish what the user tapped -
  // unless it turns out to be their own listing.
  useEffect(() => {
    if (!signedIn || !listing || !pending.current) return;
    if (listing.seller.id === user?.id) {
      pending.current = null;
      return;
    }
    if (pending.current === 'favorite') {
      pending.current = null;
      toggleFavorite(true);
    } else if (pending.current === 'message' && !isSold) {
      if (!user?.phone_verified) {
        if (!verifyAsked.current) askToVerify(); // just logged in, phone not verified yet
      } else if (!user.safety_tips_seen) {
        if (!tipsAsked.current) askToReadTips(); // verified now; show the tips first
      } else {
        pending.current = null;
        openConversation();
      }
    }
  }, [signedIn, listing, user, isSold, toggleFavorite, openConversation, askToVerify, askToReadTips]);

  const onHeart = () => (signedIn ? toggleFavorite() : askToLogIn('favorite'));
  const onMessage = () => {
    if (!signedIn) askToLogIn('message');
    else if (!user?.phone_verified) askToVerify();
    else if (!user.safety_tips_seen) askToReadTips();
    else openConversation();
  };

  // "⋯" menus: report the listing or the seller, block the seller.
  const [menu, setMenu] = useState<'listing' | 'seller' | null>(null);
  const [reportTarget, setReportTarget] = useState<{ type: 'listing' | 'user'; id: number } | null>(
    null,
  );
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState<string>();
  const [blocked, setBlocked] = useState(false);

  const needsLogin = () => {
    if (signedIn) return false;
    router.push({ pathname: '/login', params: { next: `/listing/${id}` } } as Href);
    return true;
  };
  const report = (type: 'listing' | 'user') => {
    if (!listing || needsLogin()) return;
    setReportTarget({ type, id: type === 'listing' ? listing.id : listing.seller.id });
  };
  const askBlock = () => {
    if (needsLogin()) return;
    setBlockError(undefined);
    setConfirmBlock(true);
  };
  const block = async () => {
    if (!listing) return;
    setBlocking(true);
    try {
      await blockUser(listing.seller.id);
      setConfirmBlock(false);
      setBlocked(true);
    } catch {
      setBlockError(t('listing.actionFailed'));
    } finally {
      setBlocking(false);
    }
  };

  const sendFirstMessage = async (text: string) => {
    if (!listing) return;
    setSending(true);
    setSendError(undefined);
    try {
      const conversation = await startConversation(listing.id, text);
      setMessageOpen(false);
      router.push(`/chat/${conversation.id}` as Href);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.data as { code?: string } | null)?.code === 'phone_not_verified'
      ) {
        setMessageOpen(false);
        askToVerify(); // the backend says the phone isn't verified (e.g. changed elsewhere)
        return;
      }
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
  if (blocked) {
    return (
      <FeedMessage
        kind="message"
        icon="ban-outline"
        text={t('block.done', { name: listing.seller.display_name })}
        buttonLabel={t('block.back')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    );
  }

  const menuOptions: MenuOption[] =
    menu === 'listing'
      ? [
          { label: t('report.reportListing'), icon: 'flag-outline', onPress: () => report('listing') },
          { label: t('report.reportSeller'), icon: 'person-outline', onPress: () => report('user') },
          { label: t('block.blockSeller'), icon: 'ban-outline', onPress: askBlock, danger: true },
        ]
      : [
          { label: t('report.reportSeller'), icon: 'flag-outline', onPress: () => report('user') },
          { label: t('block.blockSeller'), icon: 'ban-outline', onPress: askBlock, danger: true },
        ];

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
          {!isOwner && (
            // "⋯" in the other top corner: right in French/English, left in Arabic.
            <View
              style={[
                styles.photoMenu,
                direction === 'rtl' ? { left: Spacing.three } : { right: Spacing.three },
              ]}>
              <MoreButton onPhoto onPress={() => setMenu('listing')} />
            </View>
          )}
        </View>

        <View style={styles.body}>
          {/* Only the seller ever sees a listing that isn't approved. */}
          {listing.review_status !== 'approved' && (
            <View
              style={[
                styles.reviewBanner,
                listing.review_status === 'rejected' ? styles.rejectedBanner : styles.pendingBanner,
              ]}
              accessibilityRole="alert">
              <Ionicons
                name={listing.review_status === 'rejected' ? 'close-circle' : 'time-outline'}
                size={22}
                color={listing.review_status === 'rejected' ? '#B3261E' : '#8A5300'}
              />
              <View style={styles.flex}>
                <ThemedText
                  type="smallBold"
                  style={[align, listing.review_status === 'rejected' ? styles.rejectedText : styles.pendingText]}>
                  {listing.review_status === 'rejected'
                    ? t('listing.rejectedTitle')
                    : t('listing.underReviewTitle')}
                </ThemedText>
                <ThemedText
                  type="small"
                  style={[align, listing.review_status === 'rejected' ? styles.rejectedText : styles.pendingText]}>
                  {listing.review_status === 'rejected'
                    ? t('listing.rejectedText')
                    : t('listing.underReviewText')}
                </ThemedText>
              </View>
            </View>
          )}

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
              {/* Trust info */}
              {listing.seller.phone_verified ? (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#1E8E3E" />
                  <ThemedText type="smallBold" style={styles.verifiedText}>
                    {t('listing.phoneVerified')}
                  </ThemedText>
                </View>
              ) : null}
              <ThemedText type="small" themeColor="textSecondary" style={align}>
                {t('listing.memberSince', {
                  date: monthYear(listing.seller.member_since, language),
                })}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={align}>
                {soldCount(listing.seller.items_sold, language)}
              </ThemedText>
            </View>
            {!isOwner && <MoreButton onPress={() => setMenu('seller')} />}
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
      <OptionsMenu visible={menu !== null} options={menuOptions} onClose={() => setMenu(null)} />
      <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
      <ConfirmDialog
        visible={confirmBlock}
        title={t('block.confirmTitle', { name: listing.seller.display_name })}
        message={blockError ?? t('block.confirmMessage')}
        confirmLabel={t('block.confirm')}
        cancelLabel={t('listing.cancel')}
        onConfirm={block}
        onCancel={() => setConfirmBlock(false)}
        loading={blocking}
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
  photoMenu: { position: 'absolute', top: Spacing.three },
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
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    marginVertical: Spacing.one,
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: 999,
    backgroundColor: 'rgba(30,142,62,0.12)',
  },
  verifiedText: { color: '#1E8E3E' },
  reviewBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  pendingBanner: { backgroundColor: '#FFF4E0' },
  rejectedBanner: { backgroundColor: '#FDECEA' },
  pendingText: { color: '#8A5300' },
  rejectedText: { color: '#B3261E' },
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
