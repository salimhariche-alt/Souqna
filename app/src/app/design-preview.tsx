import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  BRANDS,
  CHOSEN_BRAND,
  DesignOverride,
  TextStyles,
  useTokens,
  type BrandId,
  type Scheme,
  type TextVariant,
} from '@/theme';
import {
  AppText,
  Badge,
  Button,
  Card,
  CategoryTile,
  EmptyState,
  ListRow,
  SectionHeader,
  TextField,
} from '@/ui';

const OPTIONS: BrandId[] = ['atlas', 'terracotta', 'safran'];

/**
 * Development screen: the 3 brand colour options on real building blocks, in light
 * and dark mode, and the font at every size. Nothing else in the app changes colour
 * until one option is chosen (CHOSEN_BRAND in src/theme/tokens.ts).
 */
export default function DesignPreviewScreen() {
  const { t } = useTranslation();
  const tk = useTokens();
  const [mode, setMode] = useState<'phone' | Scheme>('phone');
  const scheme = mode === 'phone' ? undefined : mode;

  return (
    <DesignOverride scheme={scheme}>
      <Page>
        <View style={styles.intro}>
          <AppText variant="display">{t('designPreview.title')}</AppText>
          <AppText tone="secondary">{t('designPreview.intro')}</AppText>
          <View style={styles.modes}>
            {(['phone', 'light', 'dark'] as const).map((value) => (
              <Pressable
                key={value}
                onPress={() => setMode(value)}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === value }}
                style={[
                  styles.mode,
                  {
                    borderRadius: tk.radius.full,
                    backgroundColor: mode === value ? tk.color.text : tk.color.surface,
                  },
                ]}>
                <AppText variant="smallStrong" style={{ color: mode === value ? tk.color.background : tk.color.text }}>
                  {t(`designPreview.mode.${value}`)}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.options}>
          {OPTIONS.map((brand) => (
            <DesignOverride key={brand} brand={brand}>
              <BrandSample brand={brand} />
            </DesignOverride>
          ))}
        </View>

        <TypeSample />

        <Card>
          <AppText variant="bodyStrong" align="center">
            {t('designPreview.choose')}
          </AppText>
        </Card>
      </Page>
    </DesignOverride>
  );
}

/** The screen's own background follows the chosen light/dark mode. */
function Page({ children }: { children: React.ReactNode }) {
  const tk = useTokens();
  return (
    <ScrollView
      style={{ backgroundColor: tk.color.background }}
      contentContainerStyle={[styles.page, { padding: tk.space.lg, gap: tk.space.xl }]}>
      {children}
    </ScrollView>
  );
}

function BrandSample({ brand }: { brand: BrandId }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const [category, setCategory] = useState(0);
  const info = BRANDS[brand];
  const swatches: [string, string][] = [
    [t('designPreview.swatch.primary'), tk.color.primary],
    [t('designPreview.swatch.pressed'), tk.color.primaryPressed],
    [t('designPreview.swatch.soft'), tk.color.primarySoft],
  ];
  const categories: [string, React.ComponentProps<typeof Ionicons>['name']][] = [
    [t('designPreview.sample.women'), 'woman-outline'],
    [t('designPreview.sample.men'), 'man-outline'],
    [t('designPreview.sample.kids'), 'happy-outline'],
    [t('designPreview.sample.home'), 'home-outline'],
  ];

  return (
    <View
      style={[
        styles.sample,
        { backgroundColor: tk.color.background, borderColor: tk.color.border, borderRadius: tk.radius.xl },
      ]}>
      <View style={{ gap: tk.space.xs }}>
        <AppText variant="title">{t(`designPreview.brands.${brand as 'atlas'}.name`)}</AppText>
        {brand === CHOSEN_BRAND && <Badge label={t('designPreview.chosen')} tone="brand" icon="checkmark-circle" solid />}
        <AppText variant="small" tone="secondary">
          {t(`designPreview.brands.${brand as 'atlas'}.description`)}
        </AppText>
        <AppText variant="caption" tone="muted">
          {info.light.primary} · {info.dark.primary}
        </AppText>
      </View>

      <View style={styles.swatches}>
        {swatches.map(([label, color]) => (
          <View key={label} style={styles.swatch}>
            <View style={[styles.swatchColor, { backgroundColor: color, borderColor: tk.color.border, borderRadius: tk.radius.md }]} />
            <AppText variant="caption" tone="secondary" align="center">
              {label}
            </AppText>
          </View>
        ))}
      </View>

      <SectionHeader title={t('designPreview.sample.categories')} actionLabel={t('designPreview.sample.seeAll')} onAction={() => {}} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: tk.space.sm }}>
        {categories.map(([label, icon], index) => (
          <CategoryTile key={label} label={label} icon={icon} selected={category === index} onPress={() => setCategory(index)} />
        ))}
      </ScrollView>

      <Card>
        <View style={[styles.photo, { backgroundColor: tk.color.surfaceAlt, borderRadius: tk.radius.md }]}>
          <Ionicons name="image-outline" size={36} color={tk.color.textMuted} />
          <View style={[styles.photoBadge, { start: tk.space.sm, top: tk.space.sm }]}>
            <Badge label={t('listing.sold')} tone="danger" solid />
          </View>
        </View>
        <AppText variant="subtitle">{t('designPreview.sample.price')}</AppText>
        <AppText>{t('designPreview.sample.itemTitle')}</AppText>
        <View style={styles.badges}>
          <Badge label={t('listing.phoneVerified')} tone="success" icon="checkmark-circle" />
          <Badge label={t('listing.underReviewTitle')} tone="warning" icon="time-outline" />
          <Badge label={t('designPreview.sample.new')} tone="brand" />
        </View>
      </Card>

      <Button title={t('listing.messageSeller')} icon="chatbubble-outline" onPress={() => {}} />
      <Button title={t('listing.addFavorite')} icon="heart-outline" variant="outlined" onPress={() => {}} />
      <Button title={t('report.reportListing')} icon="flag-outline" variant="ghost" onPress={() => {}} />

      <TextField label={t('sell.title')} placeholder={t('sell.titlePlaceholder')} hint={t('designPreview.sample.hint')} />

      <View style={{ gap: tk.space.sm }}>
        <ListRow icon="language-outline" label={t('language.label')} value={t('designPreview.sample.languageValue')} onPress={() => {}} />
        <ListRow icon="ban-outline" label={t('block.listTitle')} onPress={() => {}} />
        <ListRow icon="trash-outline" label={t('deleteAccount.title')} danger onPress={() => {}} />
      </View>

      <Card>
        <EmptyState icon="chatbubbles-outline" title={t('designPreview.sample.emptyTitle')} text={t('messages.empty')} actionLabel={t('messages.browse')} onAction={() => {}} />
      </Card>
    </View>
  );
}

const SAMPLES = {
  fr: 'Robe kabyle brodée – 2 500 DA',
  ar: 'فستان قبائلي مطرّز – 2500 د.ج',
  en: 'Embroidered Kabyle dress – 2,500 DA',
};

function TypeSample() {
  const { t } = useTranslation();
  const tk = useTokens();
  return (
    <Card>
      <AppText variant="title">{t('designPreview.fontTitle')}</AppText>
      <AppText variant="small" tone="secondary">
        {t('designPreview.fontText')}
      </AppText>
      {(Object.keys(TextStyles) as TextVariant[]).map((variant) => (
        <View key={variant} style={[styles.typeRow, { borderTopColor: tk.color.border }]}>
          <AppText variant="caption" tone="muted">
            {variant} · {TextStyles[variant].fontSize}
          </AppText>
          {(['fr', 'ar', 'en'] as const).map((lang) => (
            <AppText key={lang} variant={variant} style={{ writingDirection: lang === 'ar' ? 'rtl' : 'ltr', textAlign: lang === 'ar' ? 'right' : 'left' }}>
              {SAMPLES[lang]}
            </AppText>
          ))}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1100, alignSelf: 'center' },
  intro: { gap: 12 },
  modes: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  mode: { paddingVertical: 8, paddingHorizontal: 16 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 24 },
  sample: { flexGrow: 1, flexBasis: 320, maxWidth: 420, padding: 16, gap: 16, borderWidth: 1 },
  swatches: { flexDirection: 'row', gap: 12 },
  swatch: { flex: 1, gap: 4 },
  swatchColor: { height: 44, borderWidth: 1 },
  photo: { height: 150, alignItems: 'center', justifyContent: 'center' },
  photoBadge: { position: 'absolute' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeRow: { gap: 4, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
