import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PARCEL_SIZES, type ParcelSize } from '@/api/listings';
import { useTokens } from '@/theme';
import { AppText, DesignIcon, SectionHeader } from '@/ui';

type Props = {
  value: ParcelSize | '';
  onChange: (size: ParcelSize) => void;
  /** "Choose the parcel size." */
  error?: string;
  disabled?: boolean;
};

/**
 * Sell form, "Livraison": every item is delivered to a relay point in the 58 wilayas;
 * the seller chooses the parcel size (small / medium / large), which sets the price.
 */
export function ParcelSizePicker({ value, onChange, error, disabled }: Props) {
  const { t } = useTranslation();
  const tk = useTokens();
  return (
    <View style={{ gap: tk.space.sm }}>
      <SectionHeader title={t('sell.getting.title')} subtitle={t('sell.getting.subtitle')} />
      <View style={{ marginTop: tk.space.xs }}>
        <AppText variant="bodyStrong">{t('sell.getting.parcelSize')}</AppText>
        <AppText variant="small" tone="secondary">
          {t('sell.getting.parcelSizeHint')}
        </AppText>
      </View>
      <View
        accessibilityRole="radiogroup"
        style={[
          styles.sizes,
          { borderColor: error ? tk.color.danger : tk.color.border, backgroundColor: tk.color.surface },
        ]}>
        {PARCEL_SIZES.map((size, index) => {
          const selected = value === size;
          return (
            <Pressable
              key={size}
              disabled={disabled}
              onPress={() => onChange(size)}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${t(`sell.getting.sizes.${size}`)}. ${t(`sell.getting.sizeHints.${size}`)}`}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: pressed ? tk.color.surfaceAlt : 'transparent',
                  borderTopColor: tk.color.border,
                  borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                },
              ]}>
              <View style={[styles.boxIcon, { backgroundColor: tk.color.tint3 }]}>
                {/* The box grows with the size. */}
                <DesignIcon name="box" size={12 + index * 5} color={tk.brand.ink} strokeWidth={1.7} />
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{t(`sell.getting.sizes.${size}`)}</AppText>
                <AppText variant="caption" tone="secondary">
                  {t(`sell.getting.sizeHints.${size}`)}
                </AppText>
              </View>
              <View style={[styles.radio, { borderColor: selected ? tk.color.primary : tk.color.iconMuted }]}>
                {selected ? <View style={[styles.radioDot, { backgroundColor: tk.color.primary }]} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
      <Pressable
        onPress={() => router.push('/packing-tips' as Href)}
        accessibilityRole="link"
        hitSlop={8}
        style={styles.packingLink}>
        <DesignIcon name="box" size={16} color={tk.color.primary} strokeWidth={1.9} />
        <AppText variant="smallStrong" tone="primary">
          {t('packing.link')}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  sizes: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  boxIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  packingLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
});
