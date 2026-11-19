import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { discountPercent, type Offer, type OfferInMessage, type OfferStatus } from '@/api/offers';
import { useLanguage } from '@/i18n/language-provider';
import { FontFiles, useTokens } from '@/theme';
import { AppText, Button, DesignIcon } from '@/ui';
import { dateAndTime } from '@/utils/chat-time';
import { formatPrice } from '@/utils/format';

export type OfferAction = 'accept' | 'decline' | 'withdraw' | 'buy';

type Props = {
  /** The message: who sent it and what happened (made / accepted / ...). */
  message: { is_mine: boolean; offer: OfferInMessage };
  /** The offer as it is now (from the newest message about it). */
  current: Offer;
  /** False when a newer offer replaced this one in the chat. */
  isLatest: boolean;
  iAmBuyer: boolean;
  otherName: string;
  time: string;
  onAction: (action: OfferAction, offer: Offer) => Promise<void> | void;
};

/**
 * "Faire une offre" in the chat. The buyer's offer is a card (amount, "-14 %", what
 * happened to it, and the buttons: Accepter / Refuser for the seller, Retirer or
 * "Acheter à 3 000 DA" for the buyer). Answers (accepted / declined / withdrawn) are a
 * small line in the middle.
 */
export function OfferCard({ message, current, isLatest, iAmBuyer, otherName, time, onAction }: Props) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();
  const [busy, setBusy] = useState<OfferAction | null>(null);
  const { offer } = message;
  const price = formatPrice(offer.amount_dzd, language);

  if (offer.event !== 'made') {
    const icon = offer.event === 'accepted' ? 'check' : offer.event === 'declined' ? 'blocked' : 'pencil';
    return (
      <View style={styles.eventRow} accessible accessibilityLabel={t(`offers.event.${offer.event}`, { price })}>
        <View style={[styles.eventPill, { backgroundColor: tk.color.surfaceAlt }]}>
          <DesignIcon
            name={icon}
            size={14}
            color={offer.event === 'accepted' ? tk.color.success : tk.color.textSecondary}
            strokeWidth={2}
          />
          <AppText variant="caption" tone="secondary">
            {t(`offers.event.${offer.event}`, { price })} · {time}
          </AppText>
        </View>
      </View>
    );
  }

  // Replaced by a newer offer: shown as withdrawn.
  let status: OfferStatus = current.status;
  if (!isLatest && (status === 'pending' || status === 'accepted')) status = 'withdrawn';
  const live = isLatest && (status === 'pending' || status === 'accepted');
  const run = async (action: OfferAction) => {
    setBusy(action);
    try {
      await onAction(action, current);
    } finally {
      setBusy(null);
    }
  };

  const statusText =
    status === 'accepted' && current.valid_until
      ? t('offers.status.accepted', { date: dateAndTime(current.valid_until, language) })
      : t(`offers.status.${status}`);
  const statusColor =
    status === 'accepted' ? tk.color.success : status === 'pending' ? tk.color.textSecondary : tk.color.danger;
  const serif = language === 'ar' ? FontFiles.arabicBold : FontFiles.serifBold;

  return (
    <View style={[styles.row, message.is_mine ? styles.mine : styles.theirs]}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: tk.color.surface,
            borderColor: live ? tk.color.primary : tk.color.border,
            opacity: live || status === 'used' ? 1 : 0.8,
          },
        ]}>
        <AppText variant="caption" tone="secondary">
          {message.is_mine ? t('offers.youOffered') : t('offers.theyOffer', { name: otherName })}
        </AppText>
        <View style={styles.amountRow}>
          <Text
            style={[
              styles.amount,
              {
                color: live ? tk.color.primary : tk.color.textSecondary,
                fontFamily: serif,
                textDecorationLine: status === 'declined' || status === 'withdrawn' ? 'line-through' : 'none',
              },
            ]}>
            {price}
          </Text>
          <View style={[styles.discount, { backgroundColor: tk.color.chip }]}>
            <AppText variant="caption" style={{ color: tk.color.text }}>
              {t('offers.discount', { percent: discountPercent(offer.amount_dzd, offer.list_price_dzd) })}
            </AppText>
          </View>
        </View>
        <AppText variant="small" style={{ color: statusColor }} accessibilityLiveRegion="polite">
          {statusText}
        </AppText>

        {live && !iAmBuyer && status === 'pending' ? (
          <View style={styles.buttons}>
            <View style={styles.flex}>
              <Button title={t('offers.accept')} size="sm" onPress={() => run('accept')} loading={busy === 'accept'} />
            </View>
            <View style={styles.flex}>
              <Button
                title={t('offers.decline')}
                size="sm"
                variant="outlined"
                tone="danger"
                onPress={() => run('decline')}
                loading={busy === 'decline'}
              />
            </View>
          </View>
        ) : null}
        {live && iAmBuyer && status === 'accepted' ? (
          <Button
            title={t('offers.buy', { price })}
            icon="bag-check-outline"
            size="sm"
            onPress={() => run('buy')}
          />
        ) : null}
        {live && iAmBuyer ? (
          <Button
            title={t('offers.withdraw')}
            size="sm"
            variant="outlined"
            onPress={() => run('withdraw')}
            loading={busy === 'withdraw'}
          />
        ) : null}
        <AppText variant="caption" tone="secondary" style={styles.time}>
          {time}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { paddingHorizontal: 12, marginVertical: 4, flexDirection: 'row' },
  mine: { justifyContent: 'flex-end' },
  theirs: { justifyContent: 'flex-start' },
  card: { width: '78%', maxWidth: 320, borderRadius: 18, borderWidth: 1.5, padding: 12, gap: 6 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  amount: { fontSize: 22, lineHeight: 28 },
  discount: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  time: { alignSelf: 'flex-end' },
  eventRow: { alignItems: 'center', marginVertical: 6, paddingHorizontal: 12 },
  eventPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
});
