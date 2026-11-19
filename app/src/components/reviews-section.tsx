import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { fetchUserReviews, type PublicReview, type Rating } from '@/api/reviews';
import { Stars } from '@/components/stars';
import { useLanguage } from '@/i18n/language-provider';
import { useTokens } from '@/theme';
import { AppText } from '@/ui';
import { dateAndTime } from '@/utils/chat-time';
import { formatRating } from '@/utils/format';

/** How many reviews before "Voir tous les avis". */
const FIRST = 3;

/**
 * A profile's "Avis": the average and count, then the newest reviews (stars, comment,
 * who and when). Only reviews from delivered orders exist.
 */
export function ReviewsSection({ userId, rating }: { userId: number; rating: Rating }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();
  const [reviews, setReviews] = useState<PublicReview[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!rating.count) return;
    fetchUserReviews(userId)
      .then((page) => {
        setReviews(page.results);
        setNext(page.next ? 2 : null);
      })
      .catch(() => setReviews([]));
  }, [userId, rating.count]);

  const more = async () => {
    if (!expanded) {
      setExpanded(true);
      return;
    }
    if (!next) return;
    setLoadingMore(true);
    try {
      const page = await fetchUserReviews(userId, next);
      setReviews((current) => [...(current ?? []), ...page.results]);
      setNext(page.next ? next + 1 : null);
    } finally {
      setLoadingMore(false);
    }
  };

  const shown = reviews ? (expanded ? reviews : reviews.slice(0, FIRST)) : [];
  const canShowMore = reviews ? (!expanded && reviews.length > FIRST) || (expanded && !!next) : false;

  return (
    <View style={[styles.box, { backgroundColor: tk.color.surface, borderColor: tk.color.border }]}>
      <AppText variant="subtitle" accessibilityRole="header">
        {t('reviews.title')}
      </AppText>
      {rating.count && rating.average !== null ? (
        <View style={styles.summary}>
          <AppText variant="subtitle">{formatRating(rating.average, language)}</AppText>
          <Stars value={rating.average} size={16} />
          <AppText variant="small" tone="secondary">
            {t('reviews.count', { count: rating.count })}
          </AppText>
        </View>
      ) : (
        <AppText variant="small" tone="secondary">
          {t('reviews.none')}
        </AppText>
      )}
      {rating.count && !reviews ? <ActivityIndicator color={tk.color.primary} /> : null}
      {shown.map((review) => (
        <View key={review.id} style={[styles.review, { borderTopColor: tk.color.divider }]}>
          <View style={styles.summary}>
            <Stars value={review.stars} />
            <AppText variant="caption" tone="secondary" style={styles.flex}>
              {review.author.display_name} · {t(`reviews.role.${review.role}`)} ·{' '}
              {dateAndTime(review.created_at, language)}
            </AppText>
          </View>
          {review.comment ? <AppText variant="small">{review.comment}</AppText> : null}
        </View>
      ))}
      {canShowMore ? (
        <Pressable onPress={more} accessibilityRole="button" hitSlop={8} disabled={loadingMore}>
          <AppText variant="smallStrong" tone="primary">
            {loadingMore ? t('home.loading') : t('reviews.seeAll', { count: rating.count })}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  box: { marginHorizontal: 12, marginBottom: 12, borderWidth: 1, borderRadius: 20, padding: 14, gap: 10 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  review: { borderTopWidth: 1, paddingTop: 10, gap: 4 },
});
