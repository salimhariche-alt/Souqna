import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { fetchListings } from '@/api/listings';
import { LanguageSwitcher } from '@/components/language-switcher';
import { PhotoMarquee } from '@/components/photo-marquee';
import { useTokens } from '@/theme';
import { AppText, Button } from '@/ui';

/**
 * For logged-out visitors: language picker, two drifting rows of real listing photos,
 * a headline, and Sign up / Log in.
 */
export function WelcomeScreen({ next = '/profile' }: { next?: string }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<string[]>([]);

  // Cover photos of real active listings (the newest 20).
  useEffect(() => {
    fetchListings({ page: 1 })
      .then((page) =>
        setPhotos(page.results.map((l) => l.cover_photo).filter((p): p is string => Boolean(p))),
      )
      .catch(() => {}); // offline: the rows show soft placeholder tiles instead
  }, []);

  const half = Math.ceil(photos.length / 2);
  // Each row needs a few photos to loop nicely; with few photos both rows reuse them all.
  const top = photos.length >= 8 ? photos.slice(0, half) : photos;
  const bottom = photos.length >= 8 ? photos.slice(half) : [...photos].reverse();

  return (
    <ScrollView
      style={{ backgroundColor: tk.color.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + tk.space.md, paddingBottom: insets.bottom + tk.space.xl },
      ]}>
      <View style={[styles.languages, { paddingHorizontal: tk.space.lg }]}>
        <LanguageSwitcher compact />
      </View>

      <View style={[styles.photos, { gap: tk.space.md, marginVertical: tk.space.xl }]}>
        <PhotoMarquee photos={top} />
        <PhotoMarquee photos={bottom} reverse />
      </View>

      <View style={[styles.text, { paddingHorizontal: tk.space.xl, gap: tk.space.md }]}>
        <AppText variant="display" align="center" accessibilityRole="header">
          {t('welcome.headline')}
        </AppText>
        <AppText tone="secondary" align="center">
          {t('welcome.subline')}
        </AppText>
      </View>

      <View style={[styles.buttons, { paddingHorizontal: tk.space.xl, gap: tk.space.md, marginTop: tk.space.xl }]}>
        <Button
          title={t('welcome.signup')}
          onPress={() => router.push({ pathname: '/signup', params: { next } } as Href)}
        />
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center' },
  languages: { flexDirection: 'row', justifyContent: 'flex-end' },
  photos: {},
  text: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  buttons: { width: '100%', maxWidth: 480, alignSelf: 'center' },
});
