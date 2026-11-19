import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { confirmOrder, fetchOrder, fetchRelayPoints, type Order, type RelayPoint } from '@/api/delivery';
import { FeedMessage } from '@/components/feed-message';
import { RelayPicker } from '@/components/relay-picker';
import { RequireAuth } from '@/components/require-auth';
import { formErrorsFrom } from '@/i18n/api-errors';
import { useTokens } from '@/theme';
import { AppText, Button, SectionHeader } from '@/ui';

/**
 * "Confirmer la vente" (the seller, within 24 hours): choose the courier's office where
 * the parcel will be dropped off - nearest first if allowed - then the shipment is
 * created and the order page shows the code to write on the parcel. In the same wilaya
 * it is always the office the buyer chose.
 */
function ConfirmContent({ id }: { id: string }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const [order, setOrder] = useState<Order | null>(null);
  const [failed, setFailed] = useState(false);
  const [points, setPoints] = useState<RelayPoint[] | null>(null);
  const [pointsFailed, setPointsFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchOrder(id)
      .then(setOrder)
      .catch(() => setFailed(true));
  }, [id]);

  // The offices of the seller's wilaya (same wilaya: only the buyer's office).
  useEffect(() => {
    if (!order) return;
    fetchRelayPoints(order.origin_wilaya)
      .then((found) => {
        const usable = order.same_wilaya ? found.filter((p) => p.id === order.relay_point_id) : found;
        setPoints(usable);
        if (usable.length === 1) setSelected(usable[0].id);
      })
      .catch(() => setPointsFailed(true));
  }, [order]);

  if (failed) return <FeedMessage kind="message" icon="cloud-offline-outline" text={t('home.error')} />;
  if (!order) return <FeedMessage kind="loading" text={t('home.loading')} />;
  if (!order.can_confirm) {
    // Already confirmed, cancelled, too late, or not the seller.
    return (
      <FeedMessage
        kind="message"
        icon="time-outline"
        text={t('delivery.errors.notWaiting')}
        buttonLabel={t('delivery.back')}
        onPress={() => router.replace(`/order/${order.id}` as Href)}
      />
    );
  }

  const confirm = async () => {
    if (!selected) {
      setError(t('delivery.errors.dropOffRequired'));
      return;
    }
    setSending(true);
    setError(undefined);
    try {
      await confirmOrder(order.id, selected);
      router.replace(`/order/${order.id}` as Href);
    } catch (failure) {
      const result = formErrorsFrom(failure, t, { drop_off_point: 'drop_off_point' });
      setError(result.fields.drop_off_point ?? result.general);
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: tk.color.background }} contentContainerStyle={styles.page}>
      <SectionHeader
        title={t('delivery.dropOffAt')}
        subtitle={order.same_wilaya ? t('delivery.confirmSameWilaya') : t('delivery.confirmIntro')}
      />
      <RelayPicker
        points={points}
        failed={pointsFailed}
        selected={selected}
        onSelect={(pointId) => {
          setSelected(pointId);
          setError(undefined);
        }}
      />
      {error ? (
        <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
      <View style={{ gap: 8 }}>
        <Button title={t('delivery.confirmButton')} icon="checkmark-circle-outline" onPress={confirm} loading={sending} />
        <Button title={t('delivery.back')} variant="outlined" onPress={() => router.back()} />
      </View>
    </ScrollView>
  );
}

export default function ConfirmScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth next={`/order/${id}/confirm`}>
      <ConfirmContent id={id} />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 16, paddingBottom: 40, width: '100%', maxWidth: 560, alignSelf: 'center' },
});
