import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { fetchEstimate, type Estimate } from '@/api/delivery';
import { WilayaPicker } from '@/components/wilaya-picker';
import { useLanguage } from '@/i18n/language-provider';
import { useTokens } from '@/theme';
import { AppText, ArchFrame, DesignIcon } from '@/ui';
import { formatPrice } from '@/utils/format';

type Props = {
  listingId: number;
  /** The buyer's wilaya (from their profile) to start with; they can change it. */
  initialWilaya: number | null;
};

/**
 * Listing page: "Livraison 58 wilayas" - the delivery price to the buyer's wilaya
 * (pick-up at the courier's office, paid by the buyer), the delay, Sougna's fee and
 * the total. The buyer can choose another wilaya.
 */
export function DeliveryEstimate({ listingId, initialWilaya }: Props) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();
  const [wilaya, setWilaya] = useState<number | null>(initialWilaya);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    if (wilaya === null) return;
    let current = true;
    setState('loading');
    fetchEstimate(listingId, wilaya)
      .then((found) => {
        if (!current) return;
        setEstimate(found);
        setState('ready');
      })
      .catch(() => current && setState('error'));
    return () => {
      current = false;
    };
  }, [listingId, wilaya]);

  const price = (amount: number) => formatPrice(amount, language);

  return (
    <View style={[styles.card, { backgroundColor: tk.color.surface, borderColor: tk.color.border }]}>
      <View style={styles.header}>
        <ArchFrame width={40} height={44} color={tk.color.tint4} bottomRadius={8}>
          <View style={styles.center}>
            <DesignIcon name="truck" size={20} color={tk.brand.ink} strokeWidth={1.7} />
          </View>
        </ArchFrame>
        <View style={styles.flex}>
          <AppText variant="bodyStrong" accessibilityRole="header">
            {t('delivery.estimate.title')}
          </AppText>
          <AppText variant="caption" tone="secondary">
            {t('delivery.estimate.hint')}
          </AppText>
        </View>
      </View>

      <WilayaPicker variant="row" label={t('delivery.estimate.to')} value={wilaya} onChange={setWilaya} />

      {wilaya === null ? (
        <AppText variant="small" tone="secondary">
          {t('delivery.estimate.chooseWilaya')}
        </AppText>
      ) : state === 'error' ? (
        <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
          {t('delivery.estimate.unavailable')}
        </AppText>
      ) : state !== 'ready' || !estimate ? (
        <ActivityIndicator color={tk.color.primary} style={styles.loading} />
      ) : (
        <View style={{ gap: 6 }} accessibilityLiveRegion="polite">
          <Line
            label={t('delivery.estimate.delivery')}
            value={estimate.same_wilaya ? t('delivery.estimate.free') : price(estimate.delivery_price_dzd)}
            highlight={estimate.same_wilaya}
          />
          <Line label={t('delivery.estimate.fee')} value={price(estimate.buyer_fee_dzd)} />
          <View style={[styles.divider, { backgroundColor: tk.color.divider }]} />
          <Line label={t('delivery.estimate.total')} value={price(estimate.total_dzd)} strong />
          <AppText variant="caption" tone="secondary">
            {estimate.same_wilaya ? `${t('delivery.estimate.sameWilaya')} ` : ''}
            {t('delivery.estimate.days', { min: estimate.days_min, max: estimate.days_max })}
          </AppText>
        </View>
      )}
    </View>
  );
}

function Line({ label, value, strong, highlight }: { label: string; value: string; strong?: boolean; highlight?: boolean }) {
  return (
    <View style={styles.line}>
      <AppText variant={strong ? 'bodyStrong' : 'small'} tone={strong ? undefined : 'secondary'} style={styles.flex}>
        {label}
      </AppText>
      {/* "Gratuite": olive text on the white card (about 5.5:1, AA). */}
      <AppText
        variant={strong ? 'bodyStrong' : highlight ? 'smallStrong' : 'small'}
        tone={highlight ? 'success' : undefined}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { height: 1, marginVertical: 2 },
  loading: { paddingVertical: 12 },
});
