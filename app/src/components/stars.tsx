import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTokens } from '@/theme';
import { DesignIcon } from '@/ui';

/** 1-5 stars, read only (saffron filled, the rest outlined). Rounded to the nearest half-up. */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const full = Math.round(value);
  return (
    <View style={styles.row} accessible accessibilityLabel={t('reviews.starsA11y', { count: full })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <DesignIcon
          key={n}
          name="star"
          size={size}
          strokeWidth={1.6}
          color={n <= full ? tk.color.saffron : tk.color.iconMuted}
          fill={n <= full ? tk.color.saffron : 'none'}
        />
      ))}
    </View>
  );
}

/** Choosing 1-5 stars (big targets, read out as "3 étoiles sur 5"). */
export function StarInput({ value, onChange }: { value: number; onChange: (stars: number) => void }) {
  const { t } = useTranslation();
  const tk = useTokens();
  return (
    <View style={[styles.row, { gap: 4 }]} accessibilityRole="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === n }}
          accessibilityLabel={t('reviews.starsA11y', { count: n })}
          hitSlop={4}
          style={styles.target}>
          <DesignIcon
            name="star"
            size={34}
            strokeWidth={1.5}
            color={n <= value ? tk.color.saffron : tk.color.iconMuted}
            fill={n <= value ? tk.color.saffron : 'none'}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  target: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
