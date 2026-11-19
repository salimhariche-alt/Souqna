import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { Order } from '@/api/delivery';
import { postReview } from '@/api/reviews';
import { StarInput, Stars } from '@/components/stars';
import { formErrorsFrom } from '@/i18n/api-errors';
import { useTokens } from '@/theme';
import { AppText, Button, TextField } from '@/ui';

/**
 * After delivery, on the order page: "Comment s'est passée la vente ?" (stars + a few
 * words) for the buyer and the seller, then "Votre avis" and the other side's review.
 */
export function OrderReview({ order, onChanged }: { order: Order; onChanged: (order: Order) => void }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string>();
  const [commentError, setCommentError] = useState<string>();
  const [sending, setSending] = useState(false);

  if (order.status !== 'delivered') return null;
  if (!order.can_review && !order.my_review && !order.their_review) return null;
  const name = order.other_person.display_name;

  const send = async () => {
    if (!stars) {
      setError(t('reviews.chooseStars'));
      return;
    }
    setSending(true);
    setError(undefined);
    setCommentError(undefined);
    try {
      onChanged(await postReview(order.id, stars, comment.trim()));
    } catch (failure) {
      const result = formErrorsFrom(failure, t, { comment: 'comment', stars: 'stars' });
      setCommentError(result.fields.comment);
      setError(result.fields.stars ?? result.general);
    } finally {
      setSending(false);
    }
  };

  const card = [styles.card, { backgroundColor: tk.color.surface, borderColor: tk.color.border }];
  return (
    <>
      {order.can_review ? (
        <View style={[styles.card, { backgroundColor: tk.color.surface, borderColor: tk.color.primary }]}>
          <AppText variant="subtitle" style={styles.title} accessibilityRole="header">
            {t('reviews.askTitle')}
          </AppText>
          <AppText variant="small" tone="secondary">
            {order.i_am === 'buyer' ? t('reviews.askTextBuyer', { name }) : t('reviews.askTextSeller', { name })}
          </AppText>
          <StarInput
            value={stars}
            onChange={(value) => {
              setStars(value);
              setError(undefined);
            }}
          />
          <TextField
            label={t('reviews.commentLabel')}
            placeholder={t('reviews.commentPlaceholder')}
            value={comment}
            onChangeText={(value) => {
              setComment(value);
              setCommentError(undefined);
            }}
            maxLength={300}
            multiline
            error={commentError}
          />
          {error ? (
            <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
              {error}
            </AppText>
          ) : null}
          <Button title={t('reviews.send')} icon="star-outline" onPress={send} loading={sending} />
        </View>
      ) : null}
      {order.my_review ? (
        <View style={card}>
          <AppText variant="bodyStrong">{t('reviews.yours')}</AppText>
          <Stars value={order.my_review.stars} size={16} />
          {order.my_review.comment ? <AppText variant="small">{order.my_review.comment}</AppText> : null}
        </View>
      ) : null}
      {order.their_review ? (
        <View style={card}>
          <AppText variant="bodyStrong">{t('reviews.theirs', { name })}</AppText>
          <Stars value={order.their_review.stars} size={16} />
          {order.their_review.comment ? <AppText variant="small">{order.their_review.comment}</AppText> : null}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 8 },
  title: { fontSize: 18, lineHeight: 24 },
});
