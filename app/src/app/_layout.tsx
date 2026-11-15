import '@/i18n'; // set up translations before any screen renders

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AuthProvider } from '@/auth/auth-provider';
import { LanguageProvider } from '@/i18n/language-provider';

// Keep the splash screen up until the saved language has been loaded.
SplashScreen.preventAutoHideAsync().catch(() => {});

/** The tabs, with Log in / Sign up opening on top of them. */
function RootStack() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerTitleAlign: 'center' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ presentation: 'modal', title: t('auth.loginTitle') }} />
      <Stack.Screen
        name="signup"
        options={{ presentation: 'modal', title: t('auth.signupTitle') }}
      />
      <Stack.Screen name="listing/[id]/index" options={{ title: t('listing.title') }} />
      <Stack.Screen name="listing/[id]/edit" options={{ title: t('listing.editTitle') }} />
      <Stack.Screen name="chat/[id]" options={{ title: t('chat.title') }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <LanguageProvider>
        <AuthProvider>
          <RootStack />
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
