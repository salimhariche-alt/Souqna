import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { type Order, type OrderStatus } from '@/api/delivery';
import { useLanguage } from '@/i18n/language-provider';
import { FontFiles, useTokens } from '@/theme';
import { AppText, Badge, type BadgeTone, DesignIcon } from '@/ui';
import { dateAndTime } from '@/utils/chat-time';
import { formatPrice } from '@/utils/format';

/** Endings that leave the normal path (shown in the danger colour). */
const ENDINGS: OrderStatus[] = ['refused', 'returned', 'cancelled'];

/** The colour of a status: olive when delivered, red when refused/returned/cancelled, terracotta otherwise. */
export function statusTone(status: OrderStatus): BadgeTone {
  if (status === 'delivered') return 'success';
  if (ENDINGS.includes(status)) return 'danger';
  if (status === 'created') return 'neutral';
  return 'brand';
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return <Badge label={t(`delivery.status.${status}`)} tone={statusTone(status)} />;
}

/**
 * The order's timeline: its normal steps (`order.steps`, created -> delivered; no
 * "in transit" in the same wilaya) as dots on a line, done ones in terracotta (olive
 * when delivered) with their date, the next ones grey. A refused / returned /
 * cancelled order ends with those steps in the danger colour.
 */
export function OrderTimeline({ order }: { order: Order }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();
  const at = new Map(order.events.map((e) => [e.status, e]));
  // Steps to show: the normal path up to where it stopped, then the ending(s).
  const endings = ENDINGS.filter((s) => at.has(s) || s === order.status);
  const reached = order.steps.filter((s) => at.has(s));
  const steps: OrderStatus[] = endings.length ? [...reached, ...endings] : order.steps;

  return (
    <View accessibilityRole="list">
      {steps.map((step, i) => {
        const event = at.get(step);
        const done = !!event;
        const current = step === order.status;
        const color = !done
          ? tk.color.borderStrong
          : step === 'delivered'
            ? tk.color.success
            : ENDINGS.includes(step)
              ? tk.color.danger
              : tk.color.primary;
        const last = i === steps.length - 1;
        return (
          <View key={step} style={styles.step} accessible accessibilityLabel={`${t(`delivery.status.${step}`)}${event ? `, ${dateAndTime(event.created_at, language)}` : ''}`}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: done ? color : tk.color.surface, borderColor: color },
                  current && styles.dotCurrent,
                ]}>
                {done ? <DesignIcon name="check" size={current ? 14 : 11} color={tk.brand.white} strokeWidth={3} /> : null}
              </View>
              {!last && (
                <View style={[styles.line, { backgroundColor: done && at.has(steps[i + 1]) ? color : tk.color.border }]} />
              )}
            </View>
            <View style={[styles.stepText, !last && styles.stepGap]}>
              <AppText variant={current ? 'bodyStrong' : 'body'} tone={done ? 'default' : 'muted'}>
                {t(`delivery.status.${step}`)}
              </AppText>
              {event ? (
                <AppText variant="caption" tone="secondary">
                  {dateAndTime(event.created_at, language)}
                  {event.note ? ` · ${event.note}` : ''}
                </AppText>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Item, delivery, Sougna fee, and the total the buyer pays the courier (cash on delivery). */
export function AmountRows({
  item,
  delivery,
  fee,
  total,
}: {
  item: number;
  delivery: number;
  fee: number;
  total: number;
}) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();
  const row = (label: string, value: number) => (
    <View style={styles.amountRow} key={label}>
      <AppText tone="secondary">{label}</AppText>
      {/* Same wilaya: no delivery to pay ("Gratuite"). */}
      <AppText>{value === 0 ? t('delivery.estimate.free') : formatPrice(value, language)}</AppText>
    </View>
  );
  return (
    <View style={{ gap: 8 }}>
      {row(t('delivery.itemPrice'), item)}
      {row(t('delivery.deliveryPrice'), delivery)}
      {row(t('delivery.buyerFee'), fee)}
      <View style={[styles.amountRow, styles.totalRow, { borderTopColor: tk.color.divider }]}>
        <AppText variant="bodyStrong">{t('delivery.total')}</AppText>
        <Text
          style={[
            styles.total,
            { color: tk.color.primary, fontFamily: language === 'ar' ? FontFiles.arabicBold : FontFiles.serifBold },
          ]}>
          {formatPrice(total, language)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 26 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotCurrent: { width: 26, height: 26, borderRadius: 13 },
  line: { width: 2, flex: 1, minHeight: 18 },
  stepText: { flex: 1, paddingBottom: 2 },
  stepGap: { paddingBottom: 14 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  totalRow: { borderTopWidth: 1, paddingTop: 10, marginTop: 2 },
  total: { fontSize: 20, lineHeight: 26 },
});
