import * as Location from 'expo-location';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import {
  createOrder,
  fetchCommunes,
  fetchEstimate,
  fetchRelayPoints,
  sortByDistance,
  type Commune,
  type Estimate,
  type RelayPoint,
} from '@/api/delivery';
import { fetchListing, type ListingDetail } from '@/api/listings';
import { useAuth } from '@/auth/auth-provider';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FeedMessage } from '@/components/feed-message';
import { AmountRows } from '@/components/order-parts';
import { RelayMap } from '@/components/relay-map';
import { RequireAuth } from '@/components/require-auth';
import { WilayaPicker } from '@/components/wilaya-picker';
import { formErrorsFrom } from '@/i18n/api-errors';
import { useLanguage } from '@/i18n/language-provider';
import { FontFiles, useTokens } from '@/theme';
import { AppText, ArchFrame, Button, ChoiceSheet, DesignIcon, ListGroup, ListRow, SectionHeader, TextField } from '@/ui';
import { formatPrice } from '@/utils/format';

type Position = { lat: number; lng: number };
type LocationState = 'off' | 'asking' | 'on' | 'denied' | 'failed';

/**
 * "Acheter" -> "Commander": the buyer chooses the courier's office (relay point) where
 * they will collect the parcel - nearest first if they allow their approximate location
 * (sorted on the phone, never sent), otherwise their commune first - on a list and a
 * small map; then their name and phone (only for the courier) and the amounts.
 * Cash on delivery at the office: nothing is paid in the app.
 */
function Checkout({ listingId }: { listingId: number }) {
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
  const [me, setMe] = useState<Position | null>(null);
  const [locationState, setLocationState] = useState<LocationState>('off');
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
    fetchEstimate(listingId, wilaya)
      .then((found) => current && setEstimate(found))
      .catch(() => current && setEstimate(null));
    return () => {
      current = false;
    };
  }, [listingId, wilaya]);

  // Nearest first when we know where the phone is (computed here, on the phone).
  const sorted = useMemo(() => {
    if (!points) return null;
    if (!me) return points.map((point) => ({ point, km: null as number | null }));
    return sortByDistance(points, me.lat, me.lng);
  }, [points, me]);

  const findMe = async () => {
    setLocationState('off');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationState('denied');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      setMe({ lat: position.coords.latitude, lng: position.coords.longitude });
      setLocationState('on');
    } catch {
      setLocationState('failed');
    }
  };

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
              {formatPrice(listing.price_dzd, language)}
            </Text>
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

          {/* Nearest offices: explained first, then the phone asks. */}
          {wilaya && points && points.length > 1 ? (
            locationState === 'on' ? (
              <View style={styles.row}>
                <DesignIcon name="pin" size={16} color={tk.color.success} strokeWidth={1.9} />
                <AppText variant="small" tone="success">
                  {t('delivery.locationOn')}
                </AppText>
              </View>
            ) : (
              <View style={{ gap: 6 }}>
                <Button
                  title={t('delivery.useLocation')}
                  icon="navigate-outline"
                  variant="outlined"
                  size="sm"
                  onPress={() => setLocationState('asking')}
                />
                {locationState === 'denied' || locationState === 'failed' ? (
                  <AppText variant="small" tone="secondary">
                    {locationState === 'denied' ? t('delivery.locationDenied') : t('delivery.locationFailed')}
                  </AppText>
                ) : null}
              </View>
            )
          ) : null}

          {!wilaya ? null : pointsFailed ? (
            <AppText variant="small" tone="danger">
              {t('delivery.relayError')}
            </AppText>
          ) : !sorted ? (
            <View style={styles.row}>
              <ActivityIndicator color={tk.color.primary} />
              <AppText tone="secondary">{t('delivery.relayLoading')}</AppText>
            </View>
          ) : sorted.length === 0 ? (
            <View style={[styles.note, { backgroundColor: tk.color.warningSoft }]}>
              <AppText variant="small" tone="warning" style={styles.flex}>
                {t('delivery.noRelay')}
              </AppText>
            </View>
          ) : (
            <>
              <RelayMap
                points={points ?? []}
                selected={selected}
                onSelect={choose}
                me={me}
                accessibilityLabel={t('delivery.mapA11y')}
              />
              <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
                {sorted.map(({ point, km }) => (
                  <RelayPointCard
                    key={point.id}
                    point={point}
                    km={km}
                    selected={selected === point.id}
                    onPress={() => choose(point.id)}
                  />
                ))}
              </View>
            </>
          )}
          {errors.relay_point ? (
            <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
              {errors.relay_point}
            </AppText>
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
      <ConfirmDialog
        visible={locationState === 'asking'}
        title={t('delivery.locationAskTitle')}
        message={t('delivery.locationAskText')}
        confirmLabel={t('delivery.locationAllow')}
        cancelLabel={t('delivery.locationNo')}
        onConfirm={findMe}
        onCancel={() => setLocationState('off')}
      />
    </KeyboardAvoidingView>
  );
}

/** "Sam–jeu · 08:30–18:00" in the user's language. */
function useHours() {
  const { t } = useTranslation();
  return (point: RelayPoint) => {
    const days = [...point.open_days].sort((a, b) => a - b);
    const times = { opens: point.opens, closes: point.closes };
    if (days.length === 7) return t('delivery.hoursEveryDay', times);
    if (days.join() === '0,1,2,3,5,6') return t('delivery.hoursDays', { ...times, days: t('delivery.satToThu') });
    return t('delivery.hoursDays', { ...times, days: days.map((d) => t(`delivery.weekdays.d${d}`)).join(', ') });
  };
}

function RelayPointCard({
  point,
  km,
  selected,
  onPress,
}: {
  point: RelayPoint;
  km: number | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();
  const hours = useHours();
  const commune = language === 'ar' ? point.commune.name_ar : point.commune.name_fr;
  const distance = km === null ? '' : t('delivery.km', { km: km < 10 ? km.toFixed(1) : Math.round(km) });
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={[point.name, point.address, commune, hours(point), distance].filter(Boolean).join('. ')}
      style={({ pressed }) => [
        styles.point,
        {
          backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface,
          borderColor: selected ? tk.color.primary : tk.color.border,
          borderWidth: selected ? 2 : 1,
          padding: selected ? 11 : 12,
        },
      ]}>
      <View style={[styles.radio, { borderColor: selected ? tk.color.primary : tk.color.iconMuted }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: tk.color.primary }]} /> : null}
      </View>
      <View style={[styles.flex, { gap: 2 }]}>
        <AppText variant="bodyStrong">{point.name}</AppText>
        <AppText variant="small" tone="secondary">
          {point.address} · {commune}
        </AppText>
        <AppText variant="caption" tone="secondary">
          {hours(point)}
        </AppText>
      </View>
      {distance ? (
        <AppText variant="smallStrong" style={styles.km}>
          {distance}
        </AppText>
      ) : null}
    </Pressable>
  );
}

export default function CheckoutScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const listingId = Number(id);
  return (
    <RequireAuth next={`/checkout/${id ?? ''}`} verified>
      {Number.isInteger(listingId) && listingId > 0 ? (
        <Checkout listingId={listingId} />
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
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, alignItems: 'flex-start' },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 18 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  km: { marginTop: 2 },
});
