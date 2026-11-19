import { Image } from 'expo-image';
import { router, useLocalSearchParams, useNavigation, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { cancelOrder, fetchOrder, type Order } from '@/api/delivery';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FeedMessage } from '@/components/feed-message';
import { AmountRows, OrderTimeline, StatusBadge } from '@/components/order-parts';
import { RequireAuth } from '@/components/require-auth';
import { WILAYAS } from '@/constants/wilayas';
import { formErrorsFrom } from '@/i18n/api-errors';
import { useLanguage } from '@/i18n/language-provider';
import { refreshNotificationsUnread } from '@/messages/notifications-unread';
import { useTokens } from '@/theme';
import { AppText, ArchFrame, Button, DesignIcon } from '@/ui';

/** While the order page is open, ask for news this often. */
const REFRESH_MS = 30000;

/**
 * One order (buyer or seller): the item, the status timeline, where it goes, the amounts
 * (cash on delivery), and - for the seller - "Annuler l'envoi" before pick-up.
 */
function OrderContent({ id }: { id: string }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();
  const navigation = useNavigation();
  const [order, setOrder] = useState<Order | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      setOrder(await fetchOrder(id));
      setFailed(false);
      refreshNotificationsUnread();
    } catch {
      setFailed(true);
    }
  }, [id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    navigation.setOptions({ title: t('delivery.orderTitle', { id }) });
  }, [navigation, t, id]);

  if (!order) {
    return failed ? (
      <FeedMessage kind="message" icon="cloud-offline-outline" text={t('home.error')} buttonLabel={t('home.retry')} onPress={load} />
    ) : (
      <FeedMessage kind="loading" text={t('home.loading')} />
    );
  }

  const wilaya = WILAYAS.find((w) => w.code === order.wilaya);
  const place = [
    language === 'ar' ? order.commune.name_ar : order.commune.name_fr,
    wilaya ? (language === 'ar' ? wilaya.ar : wilaya.fr) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const cancel = async () => {
    setCancelling(true);
    setError(undefined);
    try {
      setOrder(await cancelOrder(order.id));
      setConfirmCancel(false);
    } catch (failure) {
      setConfirmCancel(false);
      setError(formErrorsFrom(failure, t).general);
    } finally {
      setCancelling(false);
    }
  };

  const card = [styles.card, { backgroundColor: tk.color.surface, borderColor: tk.color.border }];
  return (
    <ScrollView
      style={{ backgroundColor: tk.color.background }}
      contentContainerStyle={styles.page}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }>
      {/* The item */}
      <View style={[card, styles.row]}>
        <ArchFrame width={56} height={64} color={tk.color.tint2} bottomRadius={10}>
          {order.listing.cover_photo ? (
            <Image source={{ uri: order.listing.cover_photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
        </ArchFrame>
        <View style={[styles.flex, { gap: 4 }]}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {order.listing.title}
          </AppText>
          <AppText variant="small" tone="secondary">
            {order.i_am === 'seller'
              ? t('delivery.youSell', { name: order.other_person.display_name })
              : t('delivery.youBuy', { name: order.other_person.display_name })}
          </AppText>
          <StatusBadge status={order.status} />
        </View>
      </View>

      {/* Timeline */}
      <View style={card}>
        <AppText variant="subtitle" style={styles.cardTitle}>
          {t('delivery.timelineTitle')}
        </AppText>
        {order.tracking_number ? (
          <AppText variant="small" tone="secondary" selectable>
            {t('delivery.tracking', { number: order.tracking_number })}
          </AppText>
        ) : null}
        <View style={{ marginTop: 8 }}>
          <OrderTimeline order={order} />
        </View>
      </View>

      {/* Where it goes */}
      <View style={card}>
        <AppText variant="subtitle" style={styles.cardTitle}>
          {t('delivery.pickupAt')}
        </AppText>
        <InfoLine icon="box" text={order.stop_desk_name} />
        <InfoLine icon="pin" text={[order.relay_point_address, place].filter(Boolean).join(' · ')} />
        {/* Only the buyer sees the name and phone given to the courier. */}
        {order.i_am === 'buyer' ? (
          <InfoLine icon="person" text={`${order.recipient_name} · ${order.recipient_phone}`} />
        ) : null}
      </View>

      {/* Amounts (cash on delivery) */}
      <View style={card}>
        <AppText variant="subtitle" style={styles.cardTitle}>
          {t('delivery.amountsTitle')}
        </AppText>
        <AmountRows
          item={order.item_price_dzd}
          delivery={order.delivery_price_dzd}
          fee={order.buyer_fee_dzd}
          total={order.total_to_pay_dzd}
        />
        <AppText variant="caption" tone="secondary">
          {t('delivery.codNote')}
        </AppText>
      </View>

      {error ? (
        <AppText variant="small" tone="danger">
          {error}
        </AppText>
      ) : null}
      <Button title={t('delivery.openChat')} variant="outlined" icon="chatbubble-outline" onPress={() => router.push(`/chat/${order.conversation}` as Href)} />
      {order.can_cancel && (
        <Button title={t('delivery.cancel')} variant="outlined" tone="danger" onPress={() => setConfirmCancel(true)} />
      )}

      <ConfirmDialog
        visible={confirmCancel}
        title={t('delivery.cancelConfirmTitle')}
        message={t('delivery.cancelConfirmText')}
        confirmLabel={t('delivery.cancel')}
        cancelLabel={t('delivery.cancelKeep')}
        onConfirm={cancel}
        onCancel={() => setConfirmCancel(false)}
        loading={cancelling}
        danger
      />
    </ScrollView>
  );
}

function InfoLine({ icon, text }: { icon: 'home' | 'box' | 'pin' | 'person'; text: string }) {
  const tk = useTokens();
  return (
    <View style={[styles.row, { gap: 10, alignItems: 'flex-start' }]}>
      <DesignIcon name={icon} size={18} color={tk.color.textSecondary} strokeWidth={1.7} />
      <AppText style={styles.flex}>{text}</AppText>
    </View>
  );
}

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth next={`/order/${id}`}>
      <OrderContent id={id} />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: 20, gap: 14, paddingBottom: 40, width: '100%', maxWidth: 560, alignSelf: 'center' },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 8 },
  cardTitle: { fontSize: 18, lineHeight: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
