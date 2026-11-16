import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { type BottomTabNavigationOptions, Tabs } from 'expo-router/js-tabs';
import { useEffect, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { LanguageSwitcher } from '@/components/language-switcher';
import { refreshUnread, setUnread, useUnreadCount } from '@/messages/unread';

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
/** How often the red badge checks for new messages when the Messages tab isn't open. */
const BADGE_CHECK_MS = 30000;

export default function TabLayout() {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  const unread = useUnreadCount();

  // Keep the badge up to date while logged in; reset it when logged out.
  useEffect(() => {
    if (status !== 'signedIn') {
      setUnread(0);
      return;
    }
    refreshUnread();
    const timer = setInterval(refreshUnread, BADGE_CHECK_MS);
    return () => clearInterval(timer);
  }, [status]);

  const needsLogin = (tab: 'sell' | 'messages', needsVerifiedPhone = false) => ({
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
        options={{
          title: t('tabs.messages'),
          tabBarIcon: tabIcon('chatbubbles-outline'),
          // Red badge with the number of unread messages ("99+" above 99).
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
        }}
        listeners={needsLogin('messages')}
      />
      <Tabs.Screen
        name="profile"
        // Open to everyone: logged-out visitors see a welcome with Log in / Sign up.
        options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person-outline') }}
      />
    </Tabs>
  );
}
