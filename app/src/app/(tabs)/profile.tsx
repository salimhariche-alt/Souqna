import { Image } from 'expo-image';
import { router, useFocusEffect, useNavigation, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { fetchFavorites, fetchMyListings } from '@/api/listings';
import { useAuth } from '@/auth/auth-provider';
import { WelcomeScreen } from '@/components/welcome-screen';
import { WILAYAS } from '@/constants/wilayas';
import { useAppConfig } from '@/hooks/use-app-config';
import { LANGUAGE_NAMES, LANGUAGES, type Language } from '@/i18n';
import { useLanguage } from '@/i18n/language-provider';
import { FontFiles, useTokens } from '@/theme';
import { AppText, ArchFrame, Badge, ChoiceSheet, DesignIcon, ListGroup, ListRow, TriangleBand } from '@/ui';
import { monthYear } from '@/utils/dates';

/**
 * My profile (logged in) - exactly as docs/inspiration/warm-local/profile.html:
 * "Mon profil" + حسابي, my card (arch avatar, name, wilaya · member since, "Téléphone
 * vérifié", Kabyle band, En vente / Vendus / Favoris), the rows in one card, and
 * "Se déconnecter". Logged-out visitors see the Welcome screen instead.
 */
function ProfileMenu() {
  const { t } = useTranslation();
  const tk = useTokens();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { betaMode } = useAppConfig();
  const [languageSheet, setLanguageSheet] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [counts, setCounts] = useState<{ onSale: number | null; favorites: number | null }>({
    onSale: null,
    favorites: null,
  });

  // The numbers in my card, fresh every time the tab is shown.
  useFocusEffect(
    useCallback(() => {
      let current = true;
      Promise.allSettled([fetchMyListings('active'), fetchFavorites(1)]).then(([mine, favorites]) => {
        if (!current) return;
        setCounts({
          onSale: mine.status === 'fulfilled' ? mine.value.counts.active : null,
          favorites: favorites.status === 'fulfilled' ? favorites.value.count : null,
        });
      });
      return () => {
        current = false;
      };
    }, []),
  );

  if (!user) return null;
  const go = (href: string) => () => router.push(href as Href);
  const ar = language === 'ar';
  const serif = ar ? FontFiles.arabicBold : FontFiles.serifBold;
  const wilaya = WILAYAS.find((w) => w.code === user.wilaya);
  const meta = [wilaya ? (ar ? wilaya.ar : wilaya.fr) : null, t('listing.memberSince', { date: monthYear(user.date_joined, language) })]
    .filter(Boolean)
    .join(' · ');
  const show = (n: number | null) => (n === null ? '–' : String(n));

  return (
    <ScrollView
      style={{ backgroundColor: tk.color.background }}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 24 }]}>
      {/* "Mon profil" (Fraunces 28) and حسابي */}
      <View style={styles.titleRow}>
        <Text style={[styles.pageTitle, { color: tk.color.text, fontFamily: serif }]} accessibilityRole="header">
          {t('profile.myProfile')}
        </Text>
        {!ar && <Text style={[styles.pageTitleArabic, { color: tk.color.textSecondary }]}>{t('profile.myProfileArabic')}</Text>}
      </View>

      {/* My card */}
      <View style={[styles.card, { backgroundColor: tk.color.surface, borderColor: tk.color.border }]}>
        <Pressable onPress={go('/edit-profile')} accessibilityRole="button" accessibilityLabel={t('profile.editProfile')}>
          <ArchFrame width={92} height={104} color={tk.brand.terracotta} bottomRadius={16}>
            {user.avatar ? (
              <Image source={{ uri: user.avatar }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={styles.center}>
                <Text style={[styles.initial, { color: tk.brand.white, fontFamily: serif }]}>
                  {user.display_name.trim().charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </ArchFrame>
        </Pressable>
        <View style={styles.identity}>
          <Text style={[styles.name, { color: tk.color.text, fontFamily: serif }]} numberOfLines={1}>
            {user.display_name}
          </Text>
          <AppText variant="small" tone="secondary" align="center" style={styles.meta}>
            {meta}
          </AppText>
          {user.phone_verified ? (
            <View style={[styles.row, styles.verified]}>
              <DesignIcon name="shield" size={14} color={tk.color.success} strokeWidth={2} />
              <Text style={[styles.verifiedText, { color: tk.color.success, fontFamily: ar ? FontFiles.arabic : FontFiles.medium }]}>
                {t('listing.phoneVerified')}
              </Text>
            </View>
          ) : null}
        </View>
        <TriangleBand width={300} height={10} size={10} peak={1} opacity={0.8} style={styles.band} />
        <View style={styles.stats}>
          <Stat value={show(counts.onSale)} label={t('profile.statOnSale')} onPress={go('/my-listings')} />
          <Stat value={String(user.items_sold)} label={t('profile.statSold')} onPress={go('/my-listings')} />
          <Stat value={show(counts.favorites)} label={t('profile.statFavorites')} onPress={go('/favorites')} />
        </View>
      </View>

      {/* Not verified yet (beta: waiting for the team; otherwise: verify by SMS) */}
      {!user.phone_verified && (
        <Pressable
          onPress={() => router.push({ pathname: '/verify-phone', params: { next: '/profile' } } as Href)}
          accessibilityRole="button"
          style={[styles.notice, { backgroundColor: tk.color.warningSoft }]}>
          <AppText variant="small" tone="warning">
            {betaMode ? t('beta.waitingShort') : t('profile.whyVerify')}
          </AppText>
          <AppText variant="smallStrong" tone="warning">
            {betaMode ? t('beta.checkAgain') : t('profile.verifyNow')}
          </AppText>
        </Pressable>
      )}

      <ListGroup>
        <ListRow designIcon="list" tint="tint1" label={t('profile.myListings')} value={counts.onSale !== null ? String(counts.onSale) : undefined} onPress={go('/my-listings')} />
        <ListRow designIcon="heart" tint="tint5" label={t('profile.myFavorites')} value={counts.favorites !== null ? String(counts.favorites) : undefined} onPress={go('/favorites')} />
        <ListRow designIcon="truck" tint="tint4" label={t('delivery.ordersTitle')} onPress={go('/orders')} />
        <ListRow designIcon="bell" tint="tint2" label={t('push.title')} onPress={go('/notification-settings')} />
        <ListRow designIcon="pencil" tint="tint3" label={t('profile.editProfile')} onPress={go('/edit-profile')} />
        <ListRow designIcon="globe" tint="tint2" label={t('language.label')} value={LANGUAGE_NAMES[language]} onPress={() => setLanguageSheet(true)} />
        <ListRow designIcon="blocked" tint="tint6" label={t('block.listTitle')} onPress={go('/blocked-users')} />
        <ListRow designIcon="shield" tint="tint4" label={t('profile.safetyTips')} onPress={go('/buy-safely')} />
        <ListRow designIcon="box" tint="tint3" label={t('packing.title')} onPress={go('/packing-tips')} />
        <ListRow designIcon="help" tint="tint1" label={t('profile.helpContact')} onPress={go('/help')} />
        <ListRow designIcon="message" tint="tint2" label={t('feedback.title')} onPress={go('/feedback')} />
      </ListGroup>

      {betaMode && (
        <View style={[styles.row, { gap: 8 }]}>
          <Badge label={t('beta.label')} tone="info" icon="flask-outline" />
          <AppText variant="small" tone="secondary" style={styles.flex}>
            {t('beta.profileNote')}
          </AppText>
        </View>
      )}

      {/* "Se déconnecter": 52 high, cream, danger text */}
      <Pressable
        onPress={async () => {
          if (loggingOut) return;
          setLoggingOut(true);
          router.navigate('/'); // go Home first, so this tab shows the welcome afterwards
          await logout();
        }}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.logout,
          { backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface, borderColor: tk.color.border },
        ]}>
        {loggingOut ? (
          <ActivityIndicator color={tk.color.danger} />
        ) : (
          <Text style={[styles.logoutText, { color: tk.color.danger, fontFamily: ar ? FontFiles.arabicBold : FontFiles.bold }]}>
            {t('profile.logout')}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={go('/delete-account')} accessibilityRole="button" style={styles.smallLink} hitSlop={8}>
        <AppText variant="small" tone="danger" align="center">
          {t('deleteAccount.title')}
        </AppText>
      </Pressable>
      {/* Development only: the design system preview. */}
      {__DEV__ && (
        <Pressable onPress={go('/design-preview')} accessibilityRole="button" style={styles.smallLink} hitSlop={8}>
          <AppText variant="small" tone="secondary" align="center">
            {t('designPreview.screenTitle')}
          </AppText>
        </Pressable>
      )}

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

/** One number of my card: Fraunces 22 and a 12px grey label. */
function Stat({ value, label, onPress }: { value: string; label: string; onPress: () => void }) {
  const tk = useTokens();
  const { language } = useLanguage();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={styles.stat}>
      <Text style={[styles.statValue, { color: tk.color.text, fontFamily: FontFiles.serifBold }]}>{value}</Text>
      <Text
        style={[styles.statLabel, { color: tk.color.textSecondary, fontFamily: language === 'ar' ? FontFiles.arabic : FontFiles.regular }]}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { status } = useAuth();
  const navigation = useNavigation();
  // Both the profile and the welcome draw their own title: no header bar.
  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  if (status === 'loading') return <ActivityIndicator style={styles.loading} />;
  return status === 'signedIn' ? <ProfileMenu /> : <WelcomeScreen />;
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingBottom: 32, gap: 20, width: '100%', maxWidth: 560, alignSelf: 'center' },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loading: { marginTop: 48 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  pageTitle: { fontSize: 28, lineHeight: 36, letterSpacing: -0.5 },
  pageTitleArabic: { fontFamily: FontFiles.arabic, fontSize: 16, lineHeight: 26 },
  card: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderWidth: 1,
    borderRadius: 24,
  },
  initial: { fontSize: 38, lineHeight: 46 },
  identity: { alignItems: 'center', gap: 4 },
  name: { fontSize: 22, lineHeight: 28 },
  meta: { fontSize: 13 },
  verified: { gap: 5, marginTop: 2 },
  verifiedText: { fontSize: 13, lineHeight: 18 },
  band: { marginTop: 4 },
  stats: { flexDirection: 'row', alignSelf: 'stretch', gap: 8 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, lineHeight: 28 },
  statLabel: { fontSize: 12, lineHeight: 16 },
  notice: { borderRadius: 18, padding: 16, gap: 6 },
  logout: { height: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  logoutText: { fontSize: 15 },
  smallLink: { alignSelf: 'center', paddingVertical: 4 },
});
