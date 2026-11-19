import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PARCEL_SIZES } from '@/api/listings';
import { useLanguage } from '@/i18n/language-provider';
import { FontFiles, useTokens } from '@/theme';
import { AppText, ArchFrame, DesignIcon, TriangleBand } from '@/ui';

/** The five steps, in order. */
const STEPS = ['prepare', 'box', 'protect', 'close', 'code'] as const;
const AVOID = ['money', 'liquids', 'oldLabels', 'closeTooSoon'] as const;

/**
 * "Comment bien emballer" - for sellers: five steps from the item to the courier's
 * office, what fits each parcel size, and what to avoid. Linked from the Sell form,
 * the "Déposez le colis" card and Profile. No login needed.
 */
export default function PackingTipsScreen() {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();
  const serif = language === 'ar' ? FontFiles.arabicBold : FontFiles.serifBold;
  const card = [styles.card, { backgroundColor: tk.color.surface, borderColor: tk.color.border }];

  return (
    <ScrollView style={{ backgroundColor: tk.color.background }} contentContainerStyle={styles.page}>
      {/* Title */}
      <View style={styles.header}>
        <ArchFrame width={64} height={72} color={tk.color.tint3} bottomRadius={12}>
          <View style={styles.center}>
            <DesignIcon name="box" size={32} color={tk.brand.ink} strokeWidth={1.6} />
          </View>
        </ArchFrame>
        <Text style={[styles.title, { color: tk.color.text, fontFamily: serif }]} accessibilityRole="header">
          {t('packing.title')}
        </Text>
        <AppText tone="secondary" align="center">
          {t('packing.intro')}
        </AppText>
        <TriangleBand width={240} height={10} size={10} peak={1} opacity={0.8} />
      </View>

      {/* The five steps */}
      <View style={{ gap: 10 }} accessibilityRole="list">
        {STEPS.map((step, index) => (
          <View key={step} style={[card, styles.step]} accessible>
            <View style={[styles.number, { backgroundColor: tk.color.primary }]}>
              <Text style={[styles.numberText, { color: tk.color.onPrimary, fontFamily: serif }]}>{index + 1}</Text>
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{t(`packing.steps.${step}.title`)}</AppText>
              <AppText variant="small" tone="secondary">
                {t(`packing.steps.${step}.text`)}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      {/* What fits each size */}
      <View style={{ gap: 10 }}>
        <Text style={[styles.h2, { color: tk.color.text, fontFamily: serif }]} accessibilityRole="header">
          {t('packing.sizesTitle')}
        </Text>
        {PARCEL_SIZES.map((size, index) => (
          <View key={size} style={[card, styles.step]}>
            <View style={[styles.boxIcon, { backgroundColor: tk.color.tint3 }]}>
              <DesignIcon name="box" size={14 + index * 5} color={tk.brand.ink} strokeWidth={1.7} />
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{t(`sell.getting.sizes.${size}`)}</AppText>
              <AppText variant="small" tone="secondary">
                {t(`packing.sizes.${size}`)}
              </AppText>
            </View>
          </View>
        ))}
        <AppText variant="caption" tone="secondary">
          {t('packing.sizesNote')}
        </AppText>
      </View>

      {/* What to avoid */}
      <View style={[styles.card, { backgroundColor: tk.color.dangerSoft, borderColor: tk.color.dangerSoft }]}>
        <View style={[styles.step, { alignItems: 'center' }]}>
          <DesignIcon name="blocked" size={20} color={tk.color.danger} strokeWidth={1.9} />
          <AppText variant="bodyStrong" tone="danger">
            {t('packing.avoidTitle')}
          </AppText>
        </View>
        {AVOID.map((key) => (
          <AppText key={key} variant="small" tone="danger">
            • {t(`packing.avoid.${key}`)}
          </AppText>
        ))}
      </View>

      <AppText variant="small" tone="secondary" align="center">
        {t('packing.footer')}
      </AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  page: { padding: 20, gap: 22, paddingBottom: 40, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: { alignItems: 'center', gap: 10 },
  title: { fontSize: 26, lineHeight: 32, textAlign: 'center' },
  h2: { fontSize: 20, lineHeight: 26 },
  card: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 6 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  number: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 16, lineHeight: 20 },
  boxIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
