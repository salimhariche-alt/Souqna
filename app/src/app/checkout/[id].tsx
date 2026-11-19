import { Image } from 'expo-image';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import {
  createOrder,
  fetchCommunes,
  fetchEstimate,
  fetchRelayPoints,
  type Commune,
  type Estimate,
  type RelayPoint,
} from '@/api/delivery';
import { fetchListing, type ListingDetail } from '@/api/listings';
import { useAuth } from '@/auth/auth-provider';
import { FeedMessage } from '@/components/feed-message';
import { AmountRows } from '@/components/order-parts';
import { RelayPicker } from '@/components/relay-picker';
import { RequireAuth } from '@/components/require-auth';
import { WilayaPicker } from '@/components/wilaya-picker';
import { formErrorsFrom } from '@/i18n/api-errors';
import { useLanguage } from '@/i18n/language-provider';
import { FontFiles, useTokens } from '@/theme';
import { AppText, ArchFrame, Button, ChoiceSheet, DesignIcon, ListGroup, ListRow, SectionHeader, TextField } from '@/ui';
import { formatPrice } from '@/utils/format';

/**
 * "Acheter" -> "Commander": the buyer chooses the courier's office (relay point) where
 * they will collect the parcel - nearest first if they allow their approximate location
 * (sorted on the phone, never sent), otherwise their commune first - on a list and a
 * small map; then their name and phone (only for the courier) and the amounts.
 * Cash on delivery at the office: nothing is paid in the app.
 */
function Checkout({ listingId, offerId }: { listingId: number; offerId: number | null }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();
  const { user } = useAuth();

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [wilaya, setWilaya] = useState<number | null>(user?.wilaya ?? null);
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [commune, setCommune] = useState<Commune | null>(null);
  const [communeSheet, setCommuneSheet] = useState(false);
  const [points, setPoints] = useState<RelayPoint[] | null>(null);
  const [pointsFailed, setPointsFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [name, setName] = useState(user?.display_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string>();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchListing(listingId, true)
      .then(setListing)
      .catch(() => setLoadFailed(true));
  }, [listingId]);

  // A new wilaya: its communes, and no commune / office chosen yet.
  useEffect(() => {
    setCommune(null);
    setCommunes([]);
    setSelected(null);
    if (wilaya) fetchCommunes(wilaya).then(setCommunes).catch(() => setCommunes([]));
  }, [wilaya]);

  // The offices of the wilaya (the chosen commune's first).
  useEffect(() => {
    if (!wilaya) {
      setPoints(null);
      return;
    }
    let current = true;
    setPoints(null);
    setPointsFailed(false);
    fetchRelayPoints(wilaya, commune?.code)
      .then((found) => current && setPoints(found))
      .catch(() => current && setPointsFailed(true));
    return () => {
      current = false;
    };
  }, [wilaya, commune]);

  // The price for this wilaya (same for every office of the wilaya).
  useEffect(() => {
    if (!wilaya) {
      setEstimate(null);
      return;
    }
    let current = true;
    setEstimate(null);
    fetchEstimate(listingId, wilaya, offerId)
      .then((found) => current && setEstimate(found))
      .catch(() => current && setEstimate(null));
    return () => {
      current = false;
    };
  }, [listingId, wilaya, offerId]);

  const choose = useCallback((id: string) => {
    setSelected(id);
    setErrors((current) => ({ ...current, relay_point: '' }));
  }, []);

  if (loadFailed) return <FeedMessage kind="message" icon="cloud-offline-outline" text={t('home.error')} />;
  if (!listing) return <FeedMessage kind="loading" text={t('home.loading')} />;
  if (user && listing.seller.id === user.id) {
    return <FeedMessage kind="message" icon="pricetag-outline" text={t('delivery.errors.ownListing')} />;
  }
  if (listing.status !== 'active') {
    return <FeedMessage kind="message" icon="pricetag-outline" text={t('delivery.errors.notAvailable')} />;
  }

  const communeName = (c: { name_fr: string; name_ar: string }) => (language === 'ar' ? c.name_ar : c.name_fr);

  const send = async () => {
    const found: Record<string, string> = {};
    if (!wilaya) found.wilaya = t('errors.wilayaRequired');
    if (!selected) found.relay_point = t('delivery.errors.relayRequired');
    if (!name.trim()) found.recipient_name = t('delivery.errors.nameRequired');
    if (!phone.trim()) found.recipient_phone = t('errors.phoneInvalid');
    setErrors(found);
    setGeneral(undefined);
    if (Object.keys(found).length || !wilaya || !selected) return;
    setSending(true);
    try {
      const order = await createOrder({
        listing: listingId,
        wilaya,
        relay_point: selected,
        recipient_name: name.trim(),
        recipient_phone: phone.trim(),
        ...(offerId ? { offer: offerId } : {}),
      });
      router.replace(`/order/${order.id}` as Href);
    } catch (error) {
      // Already ordered: go to that order.
      const existing = error instanceof ApiError ? (error.data as { order?: number } | null)?.order : undefined;
      if (existing) {
        router.replace(`/order/${existing}` as Href);
        return;
      }
      const result = formErrorsFrom(error, t, {
        wilaya: 'wilaya',
        relay_point: 'relay_point',
        recipient_name: 'recipient_name',
        recipient_phone: 'recipient_phone',
      });
      setErrors(result.fields);
      setGeneral(result.general);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ backgroundColor: tk.color.background }}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled">
        {/* The item */}
        <View style={[styles.card, styles.row, { backgroundColor: tk.color.surface, borderColor: tk.color.border }]}>
          <ArchFrame width={52} height={58} color={tk.color.tint1} bottomRadius={10}>
            {listing.photos[0] ? (
              <Image source={{ uri: listing.photos[0].image }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : null}
          </ArchFrame>
          <View style={styles.flex}>
            <AppText variant="bodyStrong" numberOfLines={2}>
              {listing.title}
            </AppText>
            <Text
              style={[
                styles.price,
                { color: tk.color.primary, fontFamily: language === 'ar' ? FontFiles.arabicBold : FontFiles.serifBold },
              ]}>
              {formatPrice(estimate?.item_price_dzd ?? listing.price_dzd, language)}
            </Text>
            {/* Bought at an accepted offer's price. */}
            {offerId && estimate && estimate.item_price_dzd !== listing.price_dzd ? (
              <AppText variant="caption" tone="success">
                {t('offers.checkoutNote')} ·{' '}
                <Text style={styles.struck}>{formatPrice(listing.price_dzd, language)}</Text>
              </AppText>
            ) : null}
          </View>
        </View>

        {/* The pick-up point */}
        <View style={styles.section}>
          <SectionHeader title={t('delivery.relayTitle')} subtitle={t('delivery.relayHint')} />
          <WilayaPicker variant="row" label={t('delivery.wilaya')} value={wilaya} onChange={setWilaya} error={errors.wilaya} />
          {wilaya ? (
            <ListGroup>
              <ListRow
                designIcon="home"
                tint="tint3"
                label={t('delivery.commune')}
                value={commune ? communeName(commune) : t('sell.optional')}
                onPress={communes.length ? () => setCommuneSheet(true) : undefined}
              />
            </ListGroup>
          ) : null}

          {wilaya ? (
            <RelayPicker
              points={points}
              failed={pointsFailed}
              selected={selected}
              onSelect={choose}
              error={errors.relay_point}
            />
          ) : null}
        </View>

        {/* Name and phone: for the courier only */}
        <View style={styles.section}>
          <SectionHeader title={t('delivery.youTitle')} subtitle={t('delivery.youHint')} />
          <TextField
            label={t('delivery.recipientName')}
            value={name}
            onChangeText={setName}
            error={errors.recipient_name}
            maxLength={80}
            autoComplete="name"
          />
          <TextField
            label={t('delivery.recipientPhone')}
            placeholder="06 12 34 56 78"
            value={phone}
            onChangeText={setPhone}
            error={errors.recipient_phone}
            keyboardType="phone-pad"
            maxLength={20}
          />
        </View>

        {/* What to pay at the office */}
        {estimate ? (
          <View style={[styles.card, { backgroundColor: tk.color.surface, borderColor: tk.color.border, gap: 12 }]}>
            <AppText variant="subtitle" style={styles.cardTitle}>
              {t('delivery.payTitle')}
            </AppText>
            <AmountRows
              item={estimate.item_price_dzd}
              delivery={estimate.delivery_price_dzd}
              fee={estimate.buyer_fee_dzd}
              total={estimate.total_dzd}
            />
            <AppText variant="small" tone="secondary">
              {estimate.same_wilaya ? `${t('delivery.estimate.sameWilaya')} ` : ''}
              {t('delivery.days', { min: estimate.days_min, max: estimate.days_max })} ·{' '}
              {t('delivery.provider', { name: estimate.provider })}
            </AppText>
          </View>
        ) : null}

        <View style={[styles.note, { backgroundColor: tk.color.infoSoft }]}>
          <DesignIcon name="truck" size={20} color={tk.color.info} strokeWidth={1.7} />
          <AppText variant="small" style={[styles.flex, { color: tk.color.info }]}>
            {t('delivery.codNote')}
          </AppText>
        </View>

        {general ? (
          <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
            {general}
          </AppText>
        ) : null}
        <Button
          title={estimate ? t('delivery.confirm', { total: formatPrice(estimate.total_dzd, language) }) : t('delivery.checkoutTitle')}
          icon="bag-check-outline"
          onPress={send}
          loading={sending}
        />
      </ScrollView>

      <ChoiceSheet<number>
        visible={communeSheet}
        title={t('delivery.chooseCommune')}
        groups={[{ options: communes.map((c) => ({ value: c.code, label: language === 'ar' ? c.name_ar : `${c.name_fr} · ${c.name_ar}` })) }]}
        selected={commune?.code ?? null}
        onSelect={(code) => {
          setCommune(communes.find((c) => c.code === code) ?? null);
          setCommuneSheet(false);
        }}
        onClose={() => setCommuneSheet(false)}
      />
    </KeyboardAvoidingView>
  );
}

export default function CheckoutScreen() {
  const { t } = useTranslation();
  const { id, offer } = useLocalSearchParams<{ id: string; offer?: string }>();
  const listingId = Number(id);
  const offerId = offer && /^\d+$/.test(offer) ? Number(offer) : null;
  return (
    <RequireAuth next={`/checkout/${id ?? ''}`} verified>
      {Number.isInteger(listingId) && listingId > 0 ? (
        <Checkout listingId={listingId} offerId={offerId} />
      ) : (
        <FeedMessage kind="message" icon="search-outline" text={t('listing.notFound')} />
      )}
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: 20, gap: 22, paddingBottom: 40, width: '100%', maxWidth: 560, alignSelf: 'center' },
  section: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16 },
  cardTitle: { fontSize: 18, lineHeight: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  price: { fontSize: 17, lineHeight: 22 },
  struck: { textDecorationLine: 'line-through' },
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, alignItems: 'flex-start' },
});
