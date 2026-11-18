import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
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
import { blockUser } from '@/api/safety';
import { useAuth } from '@/auth/auth-provider';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FeedMessage } from '@/components/feed-message';
import { MessageSheet } from '@/components/message-sheet';
import { OptionsMenu, type MenuOption } from '@/components/options-menu';
import { PhotoCarousel } from '@/components/photo-carousel';
import { PhotoViewer } from '@/components/photo-viewer';
import { ReportSheet } from '@/components/report-sheet';
import { PRODUCTION_URL } from '@/config';
import { WILAYAS } from '@/constants/wilayas';
import { formErrorsFrom } from '@/i18n/api-errors';
import { useLanguage } from '@/i18n/language-provider';
import { FontFiles, useTokens } from '@/theme';
import { AppText, ArchFrame, Badge, Button, DesignIcon, type DesignIconName } from '@/ui';
import { salesCount } from '@/utils/count';
import { formatPrice } from '@/utils/format';

type LoadState = 'loading' | 'ready' | 'notFound' | 'error';
/** Something the user tapped while logged out, to finish after they log in. */
type PendingAction = 'favorite' | 'message';

/**
 * Listing details - exactly as docs/inspiration/warm-local/listing.html: the photos in a
 * big arch (with round back / share buttons), price and title in Fraunces, beige chips,
 * the seller card, the description, "Le conseil du souk", and the bottom bar (heart +
 * "Contacter Amina"; Edit / Mark sold for the seller). Report / block: the "⋯" button.
 */
export default function ListingDetailsScreen() {
  const { t } = useTranslation();
  const tk = useTokens();
  const insets = useSafeAreaInsets();
  const { language, direction } = useLanguage();
  const { status: authStatus, user } = useAuth();
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

  const reviewRejected = listing.review_status === 'rejected';
  const rtl = direction === 'rtl';
  const wilaya = WILAYAS.find((w) => w.code === listing.wilaya);
  const sellerYear = new Date(listing.seller.member_since).getFullYear();
  const serif = language === 'ar' ? FontFiles.arabicBold : FontFiles.serifBold;

  const share = () => {
    Share.share({
      message: `${listing.title} - ${formatPrice(listing.price_dzd, language)}\n${PRODUCTION_URL}/listing/${listing.id}`,
    }).catch(() => {});
  };

  return (
    <View style={[styles.screen, { backgroundColor: tk.color.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { maxWidth: tk.maxWidth, paddingTop: insets.top + 16, paddingBottom: 24 }]}>
        {/* The photo arch: 16 from the sides, 430 high, top fully round */}
        <View>
          <ArchFrame height={430} color="#D9E3EE" bottomRadius={24} style={styles.photoArch}>
            {listing.photos.length ? (
              <PhotoCarousel photos={listing.photos} height={430} onPressPhoto={setViewerAt} designDots />
            ) : (
              <View style={styles.center}>
                <DesignIcon name="shirt" size={124} color={tk.color.textSecondary} strokeWidth={0.8} />
              </View>
            )}
            {listing.status !== 'active' && (
              <View style={[styles.statusPill, rtl ? { right: 18 } : { left: 18 }]}>
                <Badge label={isSold ? t('listing.sold') : t('listing.reserved')} tone={isSold ? 'danger' : 'warning'} solid />
              </View>
            )}
          </ArchFrame>
          {/* Round buttons over the photo: back (start), share and "⋯" (end) */}
          <View style={[styles.photoButtons, { top: 8 }]} pointerEvents="box-none">
            <RoundButton
              icon={rtl ? 'chevronRight' : 'chevronLeft'}
              label={t('listing.back')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            />
            <View style={styles.row}>
              {!isOwner && <RoundButton icon="more" label={t('listing.moreOptions')} onPress={() => setMenu('listing')} iconSize={20} strokeWidth={3} />}
              <RoundButton icon="share" label={t('listing.share')} onPress={share} iconSize={18} />
            </View>
          </View>
        </View>

        <View style={styles.content}>
          {/* Only the seller ever sees a listing that isn't approved. */}
          {listing.review_status !== 'approved' && (
            <View
              style={[
                styles.notice,
                { backgroundColor: reviewRejected ? tk.color.dangerSoft : tk.color.warningSoft },
              ]}
              accessibilityRole="alert">
              <AppText variant="bodyStrong" tone={reviewRejected ? 'danger' : 'warning'}>
                {reviewRejected ? t('listing.rejectedTitle') : t('listing.underReviewTitle')}
              </AppText>
              <AppText variant="small" tone={reviewRejected ? 'danger' : 'warning'}>
                {reviewRejected ? t('listing.rejectedText') : t('listing.underReviewText')}
              </AppText>
            </View>
          )}

          {/* Price (Fraunces 32) and title (Fraunces 21) */}
          <View style={{ gap: 4 }}>
            <Text style={[styles.price, { color: tk.color.primary, fontFamily: serif }]}>
              {formatPrice(listing.price_dzd, language)}
            </Text>
            <AppText
              variant="subtitle"
              accessibilityRole="header"
              style={[styles.title, { fontFamily: language === 'ar' ? FontFiles.arabicBold : FontFiles.serifSemibold }]}>
              {listing.title}
            </AppText>
          </View>

          {/* Chips: size, condition, brand, wilaya */}
          <View style={styles.chips}>
            {listing.size ? <InfoChip text={t('listing.sizeValue', { size: listing.size })} /> : null}
            <InfoChip text={t(`listing.conditions.${listing.condition}`)} />
            {listing.brand ? <InfoChip text={listing.brand} /> : null}
            {wilaya ? (
              <View style={[styles.chip, { backgroundColor: tk.color.chip }]}>
                <DesignIcon name="pin" size={13} color={tk.color.text} strokeWidth={1.9} />
                <Text style={[styles.chipText, { color: tk.color.text }]}>
                  {language !== 'ar' ? `${wilaya.fr} · ` : ''}
                  <Text style={{ fontFamily: FontFiles.arabic }}>{wilaya.ar}</Text>
                </Text>
              </View>
            ) : null}
          </View>

          {/* Seller card: arch avatar, name, "Téléphone vérifié", member since · sales */}
          <Pressable
            onPress={() => router.push(`/seller/${listing.seller.id}` as Href)}
            accessibilityRole="button"
            accessibilityLabel={t('seller.open', { name: listing.seller.display_name })}
            style={({ pressed }) => [
              styles.sellerCard,
              { backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface, borderColor: tk.color.border },
            ]}>
            <ArchFrame width={50} height={56} color="#EBDDB3" bottomRadius={10}>
              {listing.seller.avatar ? (
                <Image source={{ uri: listing.seller.avatar }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={styles.center}>
                  <Text style={[styles.initial, { color: tk.brand.ink, fontFamily: serif }]}>
                    {listing.seller.display_name.trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </ArchFrame>
            <View style={[styles.flex, { gap: 4 }]}>
              <AppText variant="bodyStrong" style={styles.sellerName} numberOfLines={1}>
                {listing.seller.display_name}
              </AppText>
              {listing.seller.phone_verified ? <VerifiedLine /> : null}
              <AppText variant="caption" tone="secondary" style={styles.sellerMeta}>
                {t('listing.memberSince', { date: String(sellerYear) })} · {salesCount(listing.seller.items_sold, language)}
              </AppText>
            </View>
            <DesignIcon name={rtl ? 'chevronLeft' : 'chevronRight'} size={18} color={tk.color.textSecondary} strokeWidth={1.9} />
          </Pressable>

          {/* Description */}
          <View style={{ gap: 8 }}>
            <AppText variant="subtitle" style={[styles.h2, { fontFamily: serif }]} accessibilityRole="header">
              {t('listing.description')}
            </AppText>
            <AppText style={[styles.description, { color: listing.description ? tk.color.textBody : tk.color.textSecondary }]}>
              {listing.description || t('listing.noDescription')}
            </AppText>
          </View>

          {/* "Le conseil du souk" */}
          <View style={[styles.tip, { backgroundColor: tk.color.surface, borderColor: tk.color.border }]}>
            <View style={[styles.row, styles.spaceBetween]}>
              <AppText variant="bodyStrong" style={[styles.tipTitle, { fontFamily: serif }]}>
                {t('listing.tipTitle')}
              </AppText>
              {language !== 'ar' && (
                <Text style={[styles.tipArabic, { color: tk.color.textSecondary }]}>{t('listing.tipArabic')}</Text>
              )}
            </View>
            <AppText variant="small" style={[styles.tipText, { color: tk.color.textBody }]}>
              {t('listing.tipText')}
            </AppText>
          </View>

          {isSold && (
            <AppText tone="secondary" align="center">
              {isOwner ? t('listing.ownerSoldNotice') : t('listing.soldNotice')}
            </AppText>
          )}
        </View>
      </ScrollView>

      {/* Bottom bar: heart + "Contacter Amina" (or Edit / Mark sold for the seller) */}
      <View
        style={[
          styles.actionBar,
          {
            backgroundColor: tk.color.surface,
            borderTopColor: tk.color.border,
            paddingBottom: Math.max(insets.bottom, 14) + 14,
          },
        ]}>
        {actionError ? (
          <AppText variant="small" tone="danger" align="center">
            {actionError}
          </AppText>
        ) : null}
        <View style={[styles.actionRow, { maxWidth: tk.maxWidth }]}>
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
                <Pressable
                  onPress={onMessage}
                  disabled={openingChat}
                  accessibilityRole="button"
                  accessibilityState={{ busy: openingChat }}
                  style={({ pressed }) => [
                    styles.contact,
                    { backgroundColor: pressed ? tk.color.primaryPressed : tk.color.primary },
                  ]}>
                  {openingChat ? (
                    <ActivityIndicator color={tk.color.onPrimary} />
                  ) : (
                    <>
                      <DesignIcon name="message" size={19} color={tk.color.onPrimary} strokeWidth={1.9} />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.contactText,
                          { color: tk.color.onPrimary, fontFamily: language === 'ar' ? FontFiles.arabicBold : FontFiles.bold },
                        ]}>
                        {t('listing.contactSeller', { name: firstName(listing.seller.display_name) })}
                      </Text>
                    </>
                  )}
                </Pressable>
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

/** "Amina B." -> "Amina" (for "Contacter Amina"). */
function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

/** A round 44px button over the photo (cream, thin border). */
function RoundButton({
  icon,
  label,
  onPress,
  iconSize = 20,
  strokeWidth = 1.9,
}: {
  icon: DesignIconName;
  label: string;
  onPress: () => void;
  iconSize?: number;
  strokeWidth?: number;
}) {
  const tk = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.roundButton,
        { backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface, borderColor: tk.color.border },
      ]}>
      <DesignIcon name={icon} size={iconSize} color={tk.color.text} strokeWidth={strokeWidth} />
    </Pressable>
  );
}

/** A beige chip: "Taille M", "Très bon état". */
function InfoChip({ text }: { text: string }) {
  const tk = useTokens();
  const { language } = useLanguage();
  return (
    <View style={[styles.chip, { backgroundColor: tk.color.chip }]}>
      <Text
        style={[
          styles.chipText,
          { color: tk.color.text, fontFamily: language === 'ar' ? FontFiles.arabic : FontFiles.medium },
        ]}>
        {text}
      </Text>
    </View>
  );
}

/** Olive "Téléphone vérifié" with the shield. */
function VerifiedLine() {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();
  return (
    <View style={[styles.row, { gap: 5 }]}>
      <DesignIcon name="shield" size={14} color={tk.color.success} strokeWidth={2} />
      <Text
        style={[
          styles.verified,
          { color: tk.color.success, fontFamily: language === 'ar' ? FontFiles.arabic : FontFiles.medium },
        ]}>
        {t('listing.phoneVerified')}
      </Text>
    </View>
  );
}

/** The ♡ button: 54 x 54, corners 16; filled terracotta when the listing is in my favourites. */
function HeartButton({ favorited, onPress }: { favorited: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const tk = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={favorited ? t('listing.removeFavorite') : t('listing.addFavorite')}
      accessibilityState={{ selected: favorited }}
      style={({ pressed }) => [
        styles.heart,
        { backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface, borderColor: tk.color.borderStrong },
      ]}>
      <DesignIcon
        name="heart"
        size={22}
        strokeWidth={1.9}
        color={favorited ? tk.color.primary : tk.color.text}
        fill={favorited ? tk.color.primary : 'none'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spaceBetween: { justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { width: '100%', alignSelf: 'center' },
  photoArch: { marginHorizontal: 16 },
  photoButtons: {
    position: 'absolute',
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusPill: { position: 'absolute', top: 70 },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingTop: 22, paddingHorizontal: 20, gap: 18 },
  notice: { borderRadius: 18, padding: 16, gap: 4 },
  price: { fontSize: 32, lineHeight: 40, letterSpacing: -0.6 },
  title: { fontSize: 21, lineHeight: 26 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 34, paddingHorizontal: 13, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipText: { fontFamily: FontFiles.medium, fontSize: 13, lineHeight: 18 },
  sellerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderRadius: 20 },
  initial: { fontSize: 20, lineHeight: 26 },
  sellerName: { fontSize: 15 },
  verified: { fontSize: 13, lineHeight: 18 },
  sellerMeta: { fontSize: 12 },
  h2: { fontSize: 18, lineHeight: 24 },
  description: { fontSize: 15, lineHeight: 24 },
  tip: { gap: 6, padding: 16, borderRadius: 18, borderWidth: 1 },
  tipTitle: { fontSize: 16 },
  tipArabic: { fontFamily: FontFiles.arabic, fontSize: 14, lineHeight: 22 },
  tipText: { fontSize: 14, lineHeight: 21 },
  actionBar: { borderTopWidth: 1, paddingTop: 14, paddingHorizontal: 18, gap: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', alignSelf: 'center' },
  heart: { width: 54, height: 54, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  contact: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  contactText: { fontSize: 16, flexShrink: 1 },
});
