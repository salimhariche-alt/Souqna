import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import {
  errorCode,
  findConversationForListing,
  hasConversationWith,
  startConversation,
} from '@/api/conversations';
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
import { Avatar } from '@/components/avatar';
import { MessageSheet } from '@/components/message-sheet';
import { MoreButton, OptionsMenu, type MenuOption } from '@/components/options-menu';
import { ReportSheet } from '@/components/report-sheet';
import { PhotoCarousel } from '@/components/photo-carousel';
import { PhotoViewer } from '@/components/photo-viewer';
import { wilayaLabel } from '@/constants/wilayas';
import { categoryName, useCategories } from '@/hooks/use-categories';
import { useTokens } from '@/theme';
import { AppText, Badge, Button, Card, SectionHeader } from '@/ui';
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
  const tk = useTokens();
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

  // Before writing to a NEW seller (no conversation with them yet): the "Buy safely"
  // tips, every time. Remembered for this visit, so they don't show twice in a row.
  const tipsShownFor = useRef<number | null>(null);

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
      if (existing) {
        router.push(`/chat/${existing}` as Href);
        return;
      }
      const sellerId = listing.seller.id;
      if (tipsShownFor.current !== sellerId && !(await hasConversationWith(sellerId))) {
        // A new seller: the safety tips first; "Got it" brings the user back here and
        // the message box opens (see the effect below).
        tipsShownFor.current = sellerId;
        pending.current = 'message';
        router.push('/buy-safely' as Href);
        return;
      }
      setMessageOpen(true);
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
      } else {
        pending.current = null;
        openConversation(); // (shows the safety tips first if it's a new seller)
      }
    }
  }, [signedIn, listing, user, isSold, toggleFavorite, openConversation, askToVerify]);

  const onHeart = () => (signedIn ? toggleFavorite() : askToLogIn('favorite'));
  const onMessage = () => {
    if (!signedIn) askToLogIn('message');
    else if (!user?.phone_verified) askToVerify();
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
  // The first message was "may be offensive": sending the same text again = send anyway.
  const [warnedText, setWarnedText] = useState<string | null>(null);

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
      // Same text as the one we warned about = the user chose "Send anyway".
      const conversation = await startConversation(listing.id, text, warnedText === text);
      setMessageOpen(false);
      setWarnedText(null);
      router.push(`/chat/${conversation.id}` as Href);
    } catch (error) {
      const code = errorCode(error);
      if (code === 'phone_not_verified') {
        setMessageOpen(false);
        askToVerify(); // the backend says the phone isn't verified (e.g. changed elsewhere)
        return;
      }
      if (code === 'may_be_offensive') {
        setWarnedText(text);
        setSendError(t('moderation.mayBeOffensiveText'));
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

  const reviewRejected = listing.review_status === 'rejected';

  return (
    <View style={[styles.screen, { backgroundColor: tk.color.background }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: tk.maxWidth, paddingBottom: tk.space.xxl }]}>
        <View style={styles.photoBox}>
          {listing.photos.length ? (
            <PhotoCarousel photos={listing.photos} height={PHOTO_HEIGHT} onPressPhoto={setViewerAt} />
          ) : (
            <View style={[styles.noPhoto, { backgroundColor: tk.color.surfaceAlt, gap: tk.space.sm }]}>
              <Ionicons name="image-outline" size={48} color={tk.color.textMuted} />
              <AppText tone="secondary">{t('listing.noPhotos')}</AppText>
            </View>
          )}
          {listing.status !== 'active' && (
            // Top corner where reading starts: left in French/English, right in Arabic.
            <View style={[styles.corner, { top: tk.space.lg }, direction === 'rtl' ? { right: tk.space.lg } : { left: tk.space.lg }]}>
              <Badge label={isSold ? t('listing.sold') : t('listing.reserved')} tone={isSold ? 'danger' : 'warning'} solid />
            </View>
          )}
          {!isOwner && (
            // "⋯" in the other top corner: right in French/English, left in Arabic.
            <View style={[styles.corner, { top: tk.space.lg }, direction === 'rtl' ? { left: tk.space.lg } : { right: tk.space.lg }]}>
              <MoreButton onPhoto onPress={() => setMenu('listing')} />
            </View>
          )}
        </View>

        <View style={{ padding: tk.space.lg, gap: tk.space.lg }}>
          {/* Only the seller ever sees a listing that isn't approved. */}
          {listing.review_status !== 'approved' && (
            <Card style={{ backgroundColor: reviewRejected ? tk.color.dangerSoft : tk.color.warningSoft }}>
              <View style={[styles.rowStart, { gap: tk.space.md }]} accessibilityRole="alert">
                <Ionicons
                  name={reviewRejected ? 'close-circle' : 'time-outline'}
                  size={22}
                  color={reviewRejected ? tk.color.danger : tk.color.warning}
                />
                <View style={[styles.flex, { gap: tk.space.xxs }]}>
                  <AppText variant="bodyStrong" tone={reviewRejected ? 'danger' : 'warning'}>
                    {reviewRejected ? t('listing.rejectedTitle') : t('listing.underReviewTitle')}
                  </AppText>
                  <AppText variant="small" tone={reviewRejected ? 'danger' : 'warning'}>
                    {reviewRejected ? t('listing.rejectedText') : t('listing.underReviewText')}
                  </AppText>
                </View>
              </View>
            </Card>
          )}

          <View style={{ gap: tk.space.xs }}>
            <AppText variant="display">{formatPrice(listing.price_dzd, language)}</AppText>
            <AppText variant="subtitle">{listing.title}</AppText>
          </View>

          <Card>
            {details
              .filter(([, value]) => value)
              .map(([label, value], index) => (
                <View
                  key={label}
                  style={[
                    styles.detailRow,
                    { gap: tk.space.lg, paddingTop: index ? tk.space.md : 0, borderTopWidth: index ? StyleSheet.hairlineWidth : 0, borderTopColor: tk.color.border },
                  ]}>
                  <AppText variant="small" tone="secondary">
                    {label}
                  </AppText>
                  <AppText variant="smallStrong" align="end" style={styles.detailValue}>
                    {value}
                  </AppText>
                </View>
              ))}
          </Card>

          <View style={{ gap: tk.space.sm }}>
            <SectionHeader title={t('listing.description')} />
            <AppText tone={listing.description ? 'default' : 'secondary'}>
              {listing.description || t('listing.noDescription')}
            </AppText>
          </View>

          <View style={{ gap: tk.space.sm }}>
            <SectionHeader title={t('listing.seller')} />
            <Card>
              <View style={[styles.rowCenter, { gap: tk.space.md }]}>
                {/* Tapping the seller opens their public profile. */}
                <Pressable
                  onPress={() => router.push(`/seller/${listing.seller.id}` as Href)}
                  accessibilityRole="button"
                  accessibilityLabel={t('seller.open', { name: listing.seller.display_name })}
                  style={({ pressed }) => [styles.rowCenter, styles.flex, { gap: tk.space.md }, pressed && styles.pressed]}>
                  <Avatar uri={listing.seller.avatar} name={listing.seller.display_name} size={52} />
                  <View style={[styles.flex, { gap: tk.space.xxs }]}>
                    <AppText variant="bodyStrong" tone="primary" numberOfLines={1}>
                      {listing.seller.display_name}
                    </AppText>
                    {listing.seller.wilaya ? (
                      <AppText variant="small" tone="secondary">
                        {wilayaLabel(listing.seller.wilaya, language)}
                      </AppText>
                    ) : null}
                    {listing.seller.phone_verified ? (
                      <Badge label={t('listing.phoneVerified')} tone="success" icon="checkmark-circle" />
                    ) : null}
                    <AppText variant="small" tone="secondary">
                      {t('listing.memberSince', { date: monthYear(listing.seller.member_since, language) })} ·{' '}
                      {soldCount(listing.seller.items_sold, language)}
                    </AppText>
                  </View>
                </Pressable>
                {!isOwner && <MoreButton onPress={() => setMenu('seller')} />}
              </View>
            </Card>
          </View>

          {isSold && (
            <AppText tone="secondary" align="center">
              {isOwner ? t('listing.ownerSoldNotice') : t('listing.soldNotice')}
            </AppText>
          )}
        </View>
      </ScrollView>

      {/* Bottom bar with the actions */}
      <View
        style={[
          styles.actionBar,
          {
            backgroundColor: tk.color.background,
            borderTopColor: tk.color.border,
            paddingTop: tk.space.md,
            paddingHorizontal: tk.space.lg,
            paddingBottom: insets.bottom + tk.space.md,
            gap: tk.space.sm,
          },
        ]}>
        {actionError ? (
          <AppText variant="small" tone="danger" align="center">
            {actionError}
          </AppText>
        ) : null}
        <View style={[styles.actionRow, { gap: tk.space.sm, maxWidth: tk.maxWidth }]}>
          {isOwner ? (
            <>
              <View style={styles.flex}>
                <Button title={t('listing.edit')} variant="outlined" icon="create-outline" onPress={() => router.push(`/listing/${listing.id}/edit` as Href)} />
              </View>
              {!isSold && (
                <View style={styles.flex}>
                  <Button title={t('listing.markSold')} tone="danger" onPress={() => setConfirmSold(true)} />
                </View>
              )}
            </>
          ) : (
            <>
              <HeartButton favorited={listing.is_favorited} onPress={onHeart} />
              {!isSold && (
                <View style={styles.flex}>
                  <Button title={t('listing.messageSeller')} icon="chatbubble-outline" onPress={onMessage} loading={openingChat} />
                </View>
              )}
            </>
          )}
        </View>
      </View>

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
        sendLabel={warnedText ? t('moderation.sendAnyway') : undefined}
        onTextChange={() => {
          // Changed the words after the warning: check again normally.
          if (warnedText) {
            setWarnedText(null);
            setSendError(undefined);
          }
        }}
        onSend={sendFirstMessage}
        onCancel={() => {
          setMessageOpen(false);
          setSendError(undefined);
          setWarnedText(null);
        }}
      />
    </View>
  );
}

/** The round ♡ button: filled red when the listing is in my favorites. */
function HeartButton({ favorited, onPress }: { favorited: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const tk = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={favorited ? t('listing.removeFavorite') : t('listing.addFavorite')}
      accessibilityState={{ selected: favorited }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.circle,
        { backgroundColor: favorited ? tk.color.dangerSoft : tk.color.surface, borderColor: tk.color.border },
        pressed && styles.pressed,
      ]}>
      <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={26} color={favorited ? tk.color.danger : tk.color.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  scroll: { width: '100%', alignSelf: 'center' },
  photoBox: { height: PHOTO_HEIGHT },
  noPhoto: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute' },
  rowStart: { flexDirection: 'row', alignItems: 'flex-start' },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailValue: { flexShrink: 1 },
  actionBar: { borderTopWidth: StyleSheet.hairlineWidth },
  actionRow: { flexDirection: 'row', alignItems: 'center', width: '100%', alignSelf: 'center' },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
