import '@/i18n'; // set up translations before any screen renders

import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import { AuthProvider } from '@/auth/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { LanguageProvider, useLanguage } from '@/i18n/language-provider';
import { colorsFor, FONT_ASSETS, FontFiles } from '@/theme';

// Keep the splash screen up until the saved language has been loaded.
SplashScreen.preventAutoHideAsync().catch(() => {});

/** The tabs, with Log in / Sign up opening on top of them. */
function RootStack() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  return (
    <Stack
      screenOptions={{
        headerTitleAlign: 'center',
        // Screen titles in Fraunces (Noto Naskh Arabic in Arabic), like the design's titles.
        headerTitleStyle: { fontFamily: language === 'ar' ? FontFiles.arabicBold : FontFiles.serifBold, fontSize: 19 },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ presentation: 'modal', title: t('auth.loginTitle') }} />
      <Stack.Screen
        name="signup"
        options={{ presentation: 'modal', title: t('auth.signupTitle') }}
      />
      <Stack.Screen
        name="verify-phone"
        options={{ presentation: 'modal', title: t('verify.screenTitle') }}
      />
      <Stack.Screen
        name="buy-safely"
        options={{ presentation: 'modal', title: t('safety.screenTitle') }}
      />
      <Stack.Screen name="blocked-users" options={{ title: t('block.listTitle') }} />
      <Stack.Screen name="edit-profile" options={{ title: t('profile.editProfile') }} />
      <Stack.Screen name="my-listings" options={{ title: t('profile.myListings') }} />
      <Stack.Screen name="favorites" options={{ title: t('profile.myFavorites') }} />
      <Stack.Screen name="help" options={{ title: t('help.title') }} />
      <Stack.Screen name="feedback" options={{ title: t('feedback.title') }} />
      <Stack.Screen name="delete-account" options={{ title: t('deleteAccount.title') }} />
      <Stack.Screen name="seller/[id]" options={{ title: t('listing.seller') }} />
      <Stack.Screen name="design-preview" options={{ title: t('designPreview.screenTitle') }} />
      {/* The listing draws its own round back / share buttons over the photo. */}
      <Stack.Screen name="listing/[id]/index" options={{ title: t('listing.title'), headerShown: false }} />
      <Stack.Screen name="listing/[id]/edit" options={{ title: t('listing.editTitle') }} />
      <Stack.Screen name="chat/[id]" options={{ title: t('chat.title') }} />
    </Stack>
  );
}

/** Header bars, back arrows and tab bar in the design system's colours and font. */
function navigationTheme(scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const c = colorsFor(scheme);
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.primary,
      background: c.background,
      card: c.background,
      text: c.text,
      border: c.border,
      notification: c.danger, // the red unread badge
    },
    fonts: {
      regular: { fontFamily: FontFiles.regular, fontWeight: '400' },
      medium: { fontFamily: FontFiles.medium, fontWeight: '500' },
      // Header titles ("Mon profil", "Vérification") use Fraunces.
      bold: { fontFamily: FontFiles.serifSemibold, fontWeight: '600' },
      heavy: { fontFamily: FontFiles.serifBold, fontWeight: '700' },
    },
  };
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // The app's fonts (Fraunces, DM Sans, Noto Naskh Arabic). The splash screen stays until they're loaded;
  // if loading fails, the app still starts with the phone's normal font.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  if (!fontsLoaded && !fontError) return null;
  return (
    <ThemeProvider value={navigationTheme(colorScheme)}>
      {/* Clock and battery: dark on the light app, light on the dark one. */}
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <LanguageProvider>
        <AuthProvider>
          <RootStack />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
