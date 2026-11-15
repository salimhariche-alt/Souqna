import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { type BottomTabNavigationOptions, Tabs } from 'expo-router/js-tabs';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName): BottomTabNavigationOptions['tabBarIcon'] {
  return ({ color, size }) => (
    <Ionicons name={name} size={size} color={typeof color === 'string' ? color : undefined} />
  );
}

/** The bottom tab bar: Home, Search, Sell, Messages, Profile. */
export default function TabLayout() {
  const { t } = useTranslation();
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
      />
      <Tabs.Screen
        name="messages"
        options={{ title: t('tabs.messages'), tabBarIcon: tabIcon('chatbubbles-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person-outline') }}
      />
    </Tabs>
  );
}
