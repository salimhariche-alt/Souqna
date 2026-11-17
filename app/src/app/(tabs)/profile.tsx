import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useNavigation, type Href } from 'expo-router';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { Avatar } from '@/components/avatar';
import { WelcomeScreen } from '@/components/welcome-screen';
import { wilayaLabel } from '@/constants/wilayas';
import { useAppConfig } from '@/hooks/use-app-config';
import { LANGUAGE_NAMES, LANGUAGES, type Language } from '@/i18n';
import { useLanguage } from '@/i18n/language-provider';
import { useTokens } from '@/theme';
import { AppText, Badge, Card, ChoiceSheet, ListRow } from '@/ui';

/** A group of rows with a little space between them. */
function Group({ children }: PropsWithChildren) {
  const tk = useTokens();
  return <View style={{ gap: tk.space.xs }}>{children}</View>;
}

/** Profile (logged in): my card, then grouped rows. */
function ProfileMenu() {
  const { t } = useTranslation();
  const tk = useTokens();
  const { user, logout } = useAuth();
  const { language, setLanguage, direction } = useLanguage();
  const [languageSheet, setLanguageSheet] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { betaMode } = useAppConfig();

  if (!user) return null;
  const go = (href: string) => () => router.push(href as Href);

  return (
    <ScrollView
      style={{ backgroundColor: tk.color.background }}
      contentContainerStyle={[styles.container, { padding: tk.space.lg, gap: tk.space.xl, maxWidth: 560 }]}>
      {/* My card */}
      <Card onPress={go('/my-listings')} accessibilityLabel={t('profile.viewMyListings')}>
        <View style={[styles.cardRow, { gap: tk.space.lg }]}>
          <Avatar uri={user.avatar} name={user.display_name} size={64} />
          <View style={[styles.flex, { gap: tk.space.xs }]}>
            <AppText variant="title" numberOfLines={1}>
              {user.display_name}
            </AppText>
            {user.wilaya ? (
              <AppText variant="small" tone="secondary">
                {wilayaLabel(user.wilaya, language)}
              </AppText>
            ) : null}
            {user.phone_verified ? (
              <Badge label={t('listing.phoneVerified')} tone="success" icon="checkmark-circle" />
            ) : null}
            <AppText variant="smallStrong" tone="primary">
              {t('profile.viewMyListings')}
            </AppText>
          </View>
          <Ionicons name={direction === 'rtl' ? 'chevron-back' : 'chevron-forward'} size={20} color={tk.color.textMuted} />
        </View>
      </Card>

      {!user.phone_verified && (
        <Card style={{ backgroundColor: tk.color.warningSoft }}>
          <View style={[styles.cardRow, { gap: tk.space.md }]}>
            <Ionicons name="alert-circle-outline" size={24} color={tk.color.warning} />
            <AppText variant="small" style={[styles.flex, { color: tk.color.warning }]}>
              {betaMode ? t('beta.waitingShort') : t('profile.whyVerify')}
            </AppText>
          </View>
          <Pressable
            onPress={() => router.push({ pathname: '/verify-phone', params: { next: '/profile' } } as Href)}
            accessibilityRole="button">
            <AppText variant="bodyStrong" style={{ color: tk.color.warning }}>
              {betaMode ? t('beta.checkAgain') : t('profile.verifyNow')}
            </AppText>
          </Pressable>
        </Card>
      )}

      {betaMode && (
        <View style={[styles.cardRow, { gap: tk.space.sm }]}>
          <Badge label={t('beta.label')} tone="info" icon="flask-outline" />
          <AppText variant="small" tone="secondary" style={styles.flex}>
            {t('beta.profileNote')}
          </AppText>
        </View>
      )}

      <Group>
        <ListRow icon="pricetags-outline" label={t('profile.myListings')} onPress={go('/my-listings')} />
        <ListRow icon="heart-outline" label={t('profile.myFavorites')} onPress={go('/favorites')} />
      </Group>

      <Group>
        <ListRow icon="create-outline" label={t('profile.editProfile')} onPress={go('/edit-profile')} />
        <ListRow icon="language-outline" label={t('language.label')} value={LANGUAGE_NAMES[language]} onPress={() => setLanguageSheet(true)} />
        <ListRow icon="ban-outline" label={t('block.listTitle')} onPress={go('/blocked-users')} />
        <ListRow icon="shield-checkmark-outline" label={t('safety.title')} onPress={go('/buy-safely')} />
      </Group>

      <Group>
        <ListRow icon="help-circle-outline" label={t('help.title')} onPress={go('/help')} />
        <ListRow icon="chatbox-ellipses-outline" label={t('feedback.title')} onPress={go('/feedback')} />
        <ListRow
          icon="log-out-outline"
          label={t('profile.logout')}
          arrow={false}
          onPress={async () => {
            if (loggingOut) return;
            setLoggingOut(true);
            router.navigate('/'); // go Home first, so this tab shows the welcome afterwards
            await logout();
          }}
        />
      </Group>

      <Group>
        <ListRow icon="trash-outline" label={t('deleteAccount.title')} danger onPress={go('/delete-account')} />
        {/* Development only: the design system preview. */}
        {__DEV__ && <ListRow icon="color-palette-outline" label={t('designPreview.screenTitle')} onPress={go('/design-preview')} />}
      </Group>

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

export default function ProfileScreen() {
  const { status } = useAuth();
  const navigation = useNavigation();
  // Logged out: the full-screen welcome has no header bar.
  useEffect(() => {
    navigation.setOptions({ headerShown: status === 'signedIn' });
  }, [navigation, status]);

  if (status === 'loading') return <ActivityIndicator style={styles.loading} />;
  return status === 'signedIn' ? <ProfileMenu /> : <WelcomeScreen />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: 48 },
  container: { width: '100%', alignSelf: 'center' },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
});
