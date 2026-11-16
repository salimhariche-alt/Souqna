import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { type BottomTabNavigationOptions, Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { LanguageSwitcher } from '@/components/language-switcher';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName): BottomTabNavigationOptions['tabBarIcon'] {
  return ({ color, size }) => (
    <Ionicons name={name} size={size} color={typeof color === 'string' ? color : undefined} />
  );
}

/**
 * The bottom tab bar: Home, Search, Sell, Messages, Profile.
 * Home and Search are open to everyone. Sell, Messages and Profile need a login:
 * when a logged-out user taps one, the Log in screen opens first.
 * Sell also needs a verified phone: unverified users go to the verification screen.
 */
export default function TabLayout() {
  const { t } = useTranslation();
  const { status, user } = useAuth();

  const needsLogin = (tab: 'sell' | 'messages' | 'profile', needsVerifiedPhone = false) => ({
    tabPress: (event: { preventDefault: () => void }) => {
      if (status !== 'signedIn') {
        event.preventDefault(); // stay on the current tab
        router.push({ pathname: '/login', params: { next: `/${tab}` } } as Href);
      } else if (needsVerifiedPhone && !user?.phone_verified) {
        event.preventDefault();
        router.push({ pathname: '/verify-phone', params: { next: `/${tab}` } } as Href);
      }
    },
  });

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#208AEF', headerTitleAlign: 'center' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: tabIcon('home-outline'),
          // Logged-out visitors can't open Profile, so they switch language here.
          headerRight: () => <LanguageSwitcher compact />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: t('tabs.search'), tabBarIcon: tabIcon('search-outline') }}
      />
      <Tabs.Screen
        name="sell"
        options={{ title: t('tabs.sell'), tabBarIcon: tabIcon('add-circle-outline') }}
        listeners={needsLogin('sell', true)}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: t('tabs.messages'), tabBarIcon: tabIcon('chatbubbles-outline') }}
        listeners={needsLogin('messages')}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person-outline') }}
        listeners={needsLogin('profile')}
      />
    </Tabs>
  );
}
