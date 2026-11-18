import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { fetchListings } from '@/api/listings';
import { LANGUAGE_NAMES, LANGUAGES, type Language } from '@/i18n';
import { useLanguage } from '@/i18n/language-provider';
import { BrandPalette, FontFiles, useTokens } from '@/theme';
import {
  AppText,
  ArchFrame,
  Button,
  ChoiceSheet,
  DesignIcon,
  type DesignIconName,
  Logo,
  TriangleBand,
  ZelligePattern,
} from '@/ui';

/**
 * Welcome (logged-out visitors) - exactly as docs/inspiration/warm-local/welcome.html:
 * logo + language button, the terracotta arch with zellige and two small photo arches
 * (real listing photos), the "58 wilayas" pill, the Kabyle band, the headline, and
 * Sign up / Log in. The arch keeps its brand colours in dark mode too.
 */
export function WelcomeScreen({ next = '/profile' }: { next?: string }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLanguage();
  const [languageSheet, setLanguageSheet] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);

  // Two real listing photos for the small arches (the icons stay if there are none).
  useEffect(() => {
    fetchListings({ page: 1 })
      .then((page) =>
        setPhotos(page.results.map((l) => l.cover_photo).filter((p): p is string => Boolean(p)).slice(0, 2)),
      )
      .catch(() => {}); // offline: the vase and bag icons are shown
  }, []);

  return (
    <ScrollView
      style={{ backgroundColor: tk.color.background }}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 34 }]}>
      {/* Logo + language button (padding 22px 22px 0) */}
      <View style={styles.header}>
        <Logo />
        <Pressable
          onPress={() => setLanguageSheet(true)}
          accessibilityRole="button"
          accessibilityLabel={`${t('language.label')}: ${LANGUAGE_NAMES[language]}`}
          style={({ pressed }) => [
            styles.languageButton,
            {
              borderColor: tk.color.borderStrong,
              backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface,
            },
          ]}>
          <AppText variant="smallStrong" style={{ color: tk.color.text }}>
            {LANGUAGE_NAMES[language]}
          </AppText>
          <DesignIcon name="chevronDown" size={14} color={tk.color.text} />
        </Pressable>
      </View>

      {/* The big arch: 300 x 360, top fully round, bottom corners 18 */}
      <ArchFrame width={300} height={360} color={BrandPalette.terracotta} bottomRadius={18} style={styles.arch}>
        <ZelligePattern />
        <PhotoArch
          style={styles.leftPhoto}
          width={110}
          height={140}
          tint={BrandPalette.clay}
          icon="vase"
          iconSize={46}
          uri={photos[0]}
        />
        <PhotoArch
          style={styles.rightPhoto}
          width={120}
          height={150}
          tint={BrandPalette.wheat}
          icon="bag"
          iconSize={48}
          uri={photos[1]}
        />
        <View style={styles.pillRow} pointerEvents="none">
          <View style={[styles.pill, { backgroundColor: BrandPalette.cream }]}>
            <AppText
              variant="small"
              style={[
                styles.pillText,
                { color: BrandPalette.ink, fontFamily: language === 'ar' ? FontFiles.arabicBold : FontFiles.bold },
              ]}
              numberOfLines={1}>
              {t('welcome.wilayas')}
            </AppText>
          </View>
        </View>
      </ArchFrame>

      {/* Kabyle band: 300 x 12, 14px under the arch */}
      <TriangleBand width={300} style={styles.band} />

      {/* Headline + buttons (padding 22px 24px 34px, space between) */}
      <View style={styles.bottom}>
        <View style={styles.headline}>
          <AppText variant="display" align="center" accessibilityRole="header">
            {t('welcome.headline')}
          </AppText>
          {language !== 'ar' && (
            <AppText variant="body" align="center" style={[styles.tagline, { color: tk.color.textSecondary }]}>
              {t('welcome.tagline')}
            </AppText>
          )}
        </View>
        <View style={styles.buttons}>
          <Button title={t('welcome.signup')} onPress={() => router.push({ pathname: '/signup', params: { next } } as Href)} />
          <Button
            title={t('welcome.haveAccount')}
            variant="outlined"
            onPress={() => router.push({ pathname: '/login', params: { next } } as Href)}
          />
          {/* Development only: the design system preview. */}
          {__DEV__ && (
            <Button
              title={t('designPreview.screenTitle')}
              variant="ghost"
              size="sm"
              icon="color-palette-outline"
              onPress={() => router.push('/design-preview' as Href)}
            />
          )}
        </View>
      </View>

      <ChoiceSheet<Language>
        visible={languageSheet}
        title={t('language.label')}
        groups={[{ options: LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_NAMES[code] })) }]}
        selected={language}
        onSelect={(code) => {
          setLanguage(code);
          setLanguageSheet(false);
        }}
        onClose={() => setLanguageSheet(false)}
      />
    </ScrollView>
  );
}

/** A small tilted arch with a 4px cream border: a real photo, or the design's icon. */
function PhotoArch({
  width,
  height,
  tint,
  icon,
  iconSize,
  uri,
  style,
}: {
  width: number;
  height: number;
  tint: string;
  icon: DesignIconName;
  iconSize: number;
  uri?: string;
  style: object;
}) {
  return (
    <View style={[styles.photo, style]}>
      <ArchFrame
        width={width}
        height={height}
        color={tint}
        bottomRadius={14}
        borderColor={BrandPalette.cream}
        borderWidth={4}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={styles.center}>
            <DesignIcon name={icon} size={iconSize} color={BrandPalette.inkSoft} strokeWidth={1.2} />
          </View>
        )}
      </ArchFrame>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  arch: { marginTop: 26, alignSelf: 'center' },
  photo: { position: 'absolute' },
  // Physical left/right on purpose: the picture is the same in Arabic.
  leftPhoto: { left: 34, top: 132, transform: [{ rotate: '-4deg' }] },
  rightPhoto: { right: 30, top: 170, transform: [{ rotate: '4deg' }] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pillRow: { position: 'absolute', bottom: 22, left: 0, right: 0, alignItems: 'center' },
  pill: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999 },
  pillText: { fontSize: 13, lineHeight: 18 },
  band: { marginTop: 14, alignSelf: 'center' },
  bottom: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 22,
    paddingHorizontal: 24,
    gap: 24,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  headline: { gap: 8 },
  tagline: { fontSize: 18, lineHeight: 30 },
  buttons: { gap: 12 },
});
