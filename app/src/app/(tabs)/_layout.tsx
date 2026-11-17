import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { type BottomTabNavigationOptions, Tabs } from 'expo-router/js-tabs';
import { useEffect, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { BetaLabel } from '@/components/beta-label';
import { LanguageSwitcher } from '@/components/language-switcher';
import { refreshUnread, setUnread, useUnreadCount } from '@/messages/unread';
import { FontFiles, useTokens } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** The outline icon normally, the filled one when the tab is selected. */
function tabIcon(outline: IconName, filled: IconName): BottomTabNavigationOptions['tabBarIcon'] {
  return ({ color, focused }) => (
    <Ionicons
      name={focused ? filled : outline}
      size={24}
      color={typeof color === 'string' ? color : undefined}
    />
  );
}

/** Sell: a round brand-coloured "+" that stands out in the middle of the bar. */
function SellIcon() {
  const tk = useTokens();
  return (
    <View style={[styles.sell, { backgroundColor: tk.color.primary }]}>
      <Ionicons name="add" size={26} color={tk.color.onPrimary} />
    </View>
  );
}

/** How often the red dot checks for new messages when the Inbox tab isn't open. */
const BADGE_CHECK_MS = 30000;

/**
 * The bottom tab bar: Home, Browse, Sell, Inbox, Profile.
 * Home, Browse and Profile are open to everyone (logged-out visitors see a welcome on
 * Profile). Sell and Inbox need a login: tapping them opens Log in first.
 * Sell also needs a verified phone: unverified users go to the verification screen.
 * (The screens' files keep their old names - search.tsx, messages.tsx - so links work.)
 */
export default function TabLayout() {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  const unread = useUnreadCount();
  const tk = useTokens();

  // Keep the dot up to date while logged in; reset it when logged out.
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
    <Tabs
      screenOptions={{
        headerTitleAlign: 'center',
        // Selected tab in the brand colour (lighter in dark mode, so labels stay readable).
        tabBarActiveTintColor: tk.color.primary,
        tabBarInactiveTintColor: tk.color.textSecondary,
        tabBarLabelStyle: styles.label,
        tabBarStyle: {
          backgroundColor: tk.color.background,
          borderTopColor: tk.color.border,
          minHeight: 60,
        },
        headerStyle: { backgroundColor: tk.color.background },
        headerShadowVisible: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: tabIcon('home-outline', 'home'),
          // Logged-out visitors can switch language here (and on the Profile welcome).
          headerRight: () => <LanguageSwitcher compact />,
          // "Beta" pill while the server is in beta mode (testers only).
          headerLeft: () => <BetaLabel />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: t('tabs.search'), tabBarIcon: tabIcon('grid-outline', 'grid') }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: t('tabs.sell'),
          tabBarIcon: () => <SellIcon />,
          tabBarAccessibilityLabel: t('tabs.sell'),
        }}
        listeners={needsLogin('sell', true)}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages'),
          tabBarIcon: tabIcon('chatbubbles-outline', 'chatbubbles'),
          // A small red dot when there are unread messages (the number is read aloud).
          tabBarBadge: unread > 0 ? '' : undefined,
          tabBarBadgeStyle: [styles.dot, { backgroundColor: tk.color.danger }],
          tabBarAccessibilityLabel:
            unread > 0 ? t('tabs.messagesUnread', { count: unread }) : t('tabs.messages'),
        }}
        listeners={needsLogin('messages')}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person-outline', 'person') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: FontFiles.medium, fontSize: 12 },
  sell: {
    width: 40,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    minWidth: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    top: 2,
    fontSize: 1,
    lineHeight: 10,
    color: 'transparent',
  },
});
