import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { type BottomTabNavigationOptions, Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';

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
 */
export default function TabLayout() {
  const { t } = useTranslation();
  const { status } = useAuth();

  const needsLogin = (tab: 'sell' | 'messages' | 'profile') => ({
    tabPress: (event: { preventDefault: () => void }) => {
      if (status !== 'signedIn') {
        event.preventDefault(); // stay on the current tab
        router.push({ pathname: '/login', params: { next: `/${tab}` } } as Href);
      }
    },
  });

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#208AEF', headerTitleAlign: 'center' }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home-outline') }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: t('tabs.search'), tabBarIcon: tabIcon('search-outline') }}
      />
      <Tabs.Screen
        name="sell"
        options={{ title: t('tabs.sell'), tabBarIcon: tabIcon('add-circle-outline') }}
        listeners={needsLogin('sell')}
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
