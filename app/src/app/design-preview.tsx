import { type ReactNode, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { contrastRatio, isHexColor } from '@/theme/contrast';
import {
  type Colors,
  COLORS,
  DesignOverride,
  type Scheme,
  TINTS,
  type TextVariant,
  useTokens,
} from '@/theme';
import {
  AppText,
  ArchFrame,
  ArchImage,
  Badge,
  Button,
  Card,
  CategoryTile,
  Chip,
  EmptyState,
  ListRow,
  SectionHeader,
  TextField,
  TriangleBand,
  ZelligePattern,
} from '@/ui';

type Mode = 'phone' | Scheme;

/**
 * Design preview (development only: Profile -> "Design preview").
 * Shows the "Warm & Local" theme: colours with their contrast, fonts, the arch, the
 * Kabyle triangle band, the zellige pattern and every building block - in light or dark.
 */
export default function DesignPreviewScreen() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('phone');
  return (
    <DesignOverride scheme={mode === 'phone' ? undefined : mode}>
      <Preview
        modeSwitch={
          <View style={styles.wrap}>
            {(['phone', 'light', 'dark'] as const).map((m) => (
              <Chip
                key={m}
                label={t(`designPreview.mode.${m}`)}
                icon={m === 'phone' ? 'phone-portrait-outline' : m === 'light' ? 'sunny-outline' : 'moon-outline'}
                selected={mode === m}
                onPress={() => setMode(m)}
              />
            ))}
          </View>
        }
      />
    </DesignOverride>
  );
}

function Preview({ modeSwitch }: { modeSwitch: ReactNode }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const gap = { gap: tk.space.lg };
  return (
    <ScrollView
      style={{ backgroundColor: tk.color.background }}
      contentContainerStyle={[styles.page, { padding: tk.space.lg, gap: tk.space.xxl }]}>
      <View style={gap}>
        <AppText variant="display">{t('designPreview.title')}</AppText>
        <AppText tone="secondary">{t('designPreview.intro')}</AppText>
        {modeSwitch}
      </View>

      {/* Welcome example: the big arch with zellige, the band, the title and buttons */}
      <View style={gap}>
        <SectionHeader title={t('designPreview.sections.welcome')} />
        <WelcomeSample />
      </View>

      <View style={gap}>
        <SectionHeader title={t('designPreview.sections.colours')} />
        <Swatches />
      </View>

      <View style={gap}>
        <SectionHeader title={t('designPreview.sections.contrast')} />
        <AppText variant="small" tone="secondary">
          {t('designPreview.sections.contrastHint')}
        </AppText>
        <ContrastTable />
      </View>

      <View style={gap}>
        <SectionHeader title={t('designPreview.sections.fonts')} />
        <AppText variant="small" tone="secondary">
          {t('designPreview.sections.fontsHint')}
        </AppText>
        <Fonts />
      </View>

      <View style={gap}>
        <SectionHeader title={t('designPreview.sections.shapes')} />
        <Shapes />
      </View>

      <View style={gap}>
        <SectionHeader title={t('designPreview.sections.components')} />
        <Components />
      </View>
    </ScrollView>
  );
}

/** On the terracotta arch, light and dark mode look the same: use the light colours. */
const ON_ARCH = COLORS.light;

/** A small copy of the Welcome screen from the design. */
function WelcomeSample() {
  const { t } = useTranslation();
  const tk = useTokens();
  return (
    <View style={{ gap: tk.space.lg }}>
      <View>
        <ArchFrame aspectRatio={0.9} color={tk.brand.terracotta} bottomRadius={tk.radius.sm}>
          <ZelligePattern />
          <View style={styles.photos}>
            <View style={[styles.photo, { transform: [{ rotate: '-6deg' }] }]}>
              <ArchImage
                width={118}
                height={150}
                tint={ON_ARCH.tint1}
                icon="flask-outline"
                borderColor={tk.brand.white}
                borderWidth={4}
              />
            </View>
            <View style={[styles.photo, styles.photoRight, { transform: [{ rotate: '5deg' }] }]}>
              <ArchImage
                width={124}
                height={158}
                tint={ON_ARCH.tint3}
                icon="bag-handle-outline"
                borderColor={tk.brand.white}
                borderWidth={4}
              />
            </View>
          </View>
          <View style={styles.pillRow}>
            <View style={[styles.pill, { backgroundColor: tk.brand.white, borderRadius: tk.radius.full }]}>
              <AppText variant="smallStrong" style={{ color: ON_ARCH.text }}>
                {t('designPreview.sample.wilayas')}
              </AppText>
            </View>
          </View>
        </ArchFrame>
        <TriangleBand style={{ marginTop: tk.space.sm }} />
      </View>
      <AppText variant="display" align="center">
        {t('designPreview.sample.welcomeTitle')}
      </AppText>
      <AppText variant="body" tone="secondary" align="center">
        {t('designPreview.sample.welcomeArabic')}
      </AppText>
      <Button title={t('designPreview.sample.createAccount')} onPress={() => {}} />
      <Button title={t('designPreview.sample.haveAccount')} variant="outlined" onPress={() => {}} />
    </View>
  );
}

const SWATCHES: (keyof Colors)[] = [
  'background', 'surface', 'chip', 'border', 'borderStrong', 'text', 'textSecondary', 'textMuted',
  'primary', 'primaryPressed', 'onPrimary', 'saffron', 'casbah', 'olive',
  'tint1', 'tint2', 'tint3', 'tint4', 'tint5', 'success', 'warning', 'danger', 'info',
];

function Swatches() {
  const tk = useTokens();
  return (
    <View style={styles.wrap}>
      {SWATCHES.map((key) => (
        <View key={key} style={[styles.swatch, { gap: tk.space.xs }]}>
          <View
            style={[
              styles.swatchColor,
              { backgroundColor: tk.color[key], borderColor: tk.color.borderStrong, borderRadius: tk.radius.md },
            ]}
          />
          <AppText variant="caption" numberOfLines={1}>
            {key}
          </AppText>
          <AppText variant="caption" tone="secondary" numberOfLines={1}>
            {tk.color[key]}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** [text colour, background] pairs used in the app. */
const PAIRS: [keyof Colors, keyof Colors][] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['text', 'chip'],
  ['textSecondary', 'background'],
  ['textSecondary', 'surface'],
  ['textSecondary', 'chip'],
  ['textMuted', 'background'],
  ['textMuted', 'surface'],
  ['primary', 'background'],
  ['primary', 'surface'],
  ['onPrimary', 'primary'],
  ['success', 'background'],
  ['success', 'surface'],
  ['danger', 'background'],
  ['danger', 'surface'],
  ['warning', 'surface'],
  ['info', 'surface'],
  ['text', 'tint1'],
  ['text', 'tint2'],
  ['tintIcon', 'tint3'],
];

function ContrastTable() {
  const tk = useTokens();
  return (
    <Card padded={false}>
      {PAIRS.map(([fg, bg], i) => {
        const a = tk.color[fg];
        const b = tk.color[bg];
        if (!isHexColor(a) || !isHexColor(b)) return null;
        const ratio = contrastRatio(a, b);
        const ok = ratio >= 4.5;
        return (
          <View
            key={`${fg}-${bg}`}
            style={[
              styles.contrastRow,
              { backgroundColor: b, paddingHorizontal: tk.space.lg, borderTopWidth: i ? 1 : 0, borderColor: tk.color.border },
            ]}>
            <AppText variant="smallStrong" style={[styles.flex, { color: a }]} numberOfLines={1}>
              {fg} / {bg}
            </AppText>
            <Badge label={`${ratio.toFixed(1)}:1`} tone={ok ? 'success' : 'danger'} icon={ok ? 'checkmark' : 'close'} />
          </View>
        );
      })}
    </Card>
  );
}

const FONT_SAMPLES: { variant: TextVariant; text: string }[] = [
  { variant: 'display', text: 'Le souk de chez nous' },
  { variant: 'title', text: 'Mon profil' },
  { variant: 'subtitle', text: 'Près de chez vous' },
  { variant: 'price', text: '3 500 DA' },
  { variant: 'bodyStrong', text: 'Veste en jean oversize' },
  { variant: 'body', text: 'Plat en céramique, très bon état.' },
  { variant: 'small', text: 'Oran · Membre depuis 2026' },
  { variant: 'caption', text: 'Accueil · Explorer · Vendre' },
];

const ARABIC_SAMPLES: { variant: TextVariant; text: string }[] = [
  { variant: 'display', text: 'سوق الجزائر في جيبك' },
  { variant: 'subtitle', text: 'قريب منك' },
  { variant: 'body', text: 'طبق من الفخار، حالة جيدة جدًا.' },
  { variant: 'small', text: 'وهران · عضو منذ 2026' },
];

function Fonts() {
  const tk = useTokens();
  return (
    <Card>
      {FONT_SAMPLES.map(({ variant, text }) => (
        <View key={variant} style={styles.fontRow}>
          <AppText variant="caption" tone="muted" style={styles.fontLabel}>
            {variant}
          </AppText>
          <AppText variant={variant} tone={variant === 'price' ? 'primary' : 'default'} style={styles.flex}>
            {text}
          </AppText>
        </View>
      ))}
      <TriangleBand style={{ marginVertical: tk.space.sm }} />
      {ARABIC_SAMPLES.map(({ variant, text }) => (
        <View key={`ar-${variant}`} style={styles.fontRow}>
          <AppText variant="caption" tone="muted" style={styles.fontLabel}>
            {variant}
          </AppText>
          <AppText variant={variant} style={[styles.flex, styles.arabic]}>
            {text}
          </AppText>
        </View>
      ))}
    </Card>
  );
}

function Shapes() {
  const tk = useTokens();
  const icons = ['bag-handle-outline', 'shirt-outline', 'flask-outline', 'watch-outline', 'home-outline'] as const;
  return (
    <View style={{ gap: tk.space.lg }}>
      {/* Arches in the 5 soft tints (image placeholders) */}
      <View style={[styles.row, { gap: tk.space.sm }]}>
        {TINTS.map((tint, i) => (
          <View key={tint} style={styles.flex}>
            <ArchImage tint={tk.color[tint]} icon={icons[i]} iconSize={24} aspectRatio={0.78} />
          </View>
        ))}
      </View>
      {/* Arch avatars */}
      <View style={[styles.row, { gap: tk.space.lg }]}>
        <ArchFrame width={64} height={72} color={tk.color.tint3} bottomRadius={tk.radius.sm}>
          <View style={styles.center}>
            <AppText variant="title">A</AppText>
          </View>
        </ArchFrame>
        <ArchFrame width={64} height={72} color={tk.brand.terracotta} bottomRadius={tk.radius.sm}>
          <View style={styles.center}>
            <AppText variant="title" style={{ color: tk.brand.white }}>
              S
            </AppText>
          </View>
        </ArchFrame>
        {/* Zellige on its own, in a small arch */}
        <ArchFrame width={64} height={72} color={tk.brand.casbah} bottomRadius={tk.radius.sm}>
          <ZelligePattern cell={22} />
        </ArchFrame>
      </View>
      <TriangleBand />
      <TriangleBand height={14} size={16} />
    </View>
  );
}

function Components() {
  const { t } = useTranslation();
  const tk = useTokens();
  const [selected, setSelected] = useState(1);
  const s = (key: string) => t(`designPreview.sample.${key}`);
  return (
    <View style={{ gap: tk.space.lg }}>
      <TextField label={s('searchLabel')} placeholder={s('search')} icon="search-outline" />

      <View style={styles.wrap}>
        <Chip label={s('size')} />
        <Chip label={s('condition')} />
        <Chip label={s('wilaya')} icon="location-outline" />
        <Chip label={s('new')} selected onPress={() => {}} />
      </View>

      <SectionHeader
        title={s('nearYou')}
        subtitle={s('nearYouArabic')}
        actionLabel={s('seeAll')}
        onAction={() => {}}
      />
      <View style={[styles.row, { gap: tk.space.md }]}>
        {[tk.color.tint1, tk.color.tint2].map((tint, i) => (
          <View key={tint} style={[styles.flex, { gap: tk.space.xs }]}>
            <ArchImage tint={tint} icon={i ? 'shirt-outline' : 'bag-handle-outline'} aspectRatio={0.85} />
            <AppText variant="price" tone="primary">
              {s('price')}
            </AppText>
            <AppText variant="small" numberOfLines={1}>
              {s('itemTitle')}
            </AppText>
          </View>
        ))}
      </View>

      {/* Seller card */}
      <Card onPress={() => {}}>
        <View style={[styles.row, { gap: tk.space.md }]}>
          <ArchFrame width={52} height={60} color={tk.color.tint3} bottomRadius={tk.radius.sm}>
            <View style={styles.center}>
              <AppText variant="subtitle">A</AppText>
            </View>
          </ArchFrame>
          <View style={[styles.flex, { gap: tk.space.xs }]}>
            <AppText variant="bodyStrong">{s('seller')}</AppText>
            <Badge label={s('verified')} tone="success" icon="shield-checkmark-outline" />
            <AppText variant="small" tone="secondary">
              {s('memberSince')}
            </AppText>
          </View>
        </View>
      </Card>

      <View style={styles.wrap}>
        <Badge label={s('verified')} tone="success" icon="shield-checkmark-outline" />
        <Badge label={s('pending')} tone="warning" icon="time-outline" />
        <Badge label={s('sold')} tone="danger" />
        <Badge label={s('new')} tone="brand" />
        <Badge label={s('wilaya')} tone="info" />
      </View>

      <Card padded={false} style={{ gap: 0 }}>
        <ListRow icon="list-outline" tint="tint1" label={s('myListings')} value="8" onPress={() => {}} />
        <ListRow icon="heart-outline" tint="tint5" label={s('favourites')} value="14" onPress={() => {}} />
        <ListRow icon="pencil-outline" tint="tint3" label={s('editProfile')} onPress={() => {}} />
        <ListRow icon="globe-outline" tint="tint2" label={s('language')} value={s('languageValue')} onPress={() => {}} />
      </Card>

      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        {(['women', 'men', 'kids', 'home'] as const).map((key, i) => (
          <CategoryTile
            key={key}
            label={s(key)}
            icon={(['woman-outline', 'man-outline', 'happy-outline', 'home-outline'] as const)[i]}
            tint={TINTS[i]}
            selected={selected === i}
            onPress={() => setSelected(i)}
            size={80}
          />
        ))}
      </View>

      <Button title={s('contact')} icon="chatbubble-outline" onPress={() => {}} />
      <Button title={s('logout')} variant="outlined" tone="danger" onPress={() => {}} />
      <Button title={s('seeAll')} variant="ghost" size="sm" onPress={() => {}} fullWidth={false} />

      <Card>
        <EmptyState icon="chatbubbles-outline" title={s('emptyTitle')} text={s('emptyText')} tint="tint2" />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 6 },
  photos: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: '22%' },
  photo: { marginHorizontal: -6 },
  photoRight: { marginTop: 40 },
  pillRow: { position: 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center' },
  pill: { paddingHorizontal: 16, paddingVertical: 6 },
  swatch: { width: 76 },
  swatchColor: { height: 44, borderWidth: 1 },
  contrastRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 },
  fontRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fontLabel: { width: 72 },
  arabic: { writingDirection: 'rtl', textAlign: 'right' },
});
