import { router, type Href } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { useLanguage } from '@/i18n/language-provider';
import { refreshNotificationsUnread, setNotificationsUnread } from '@/messages/notifications-unread';
import { refreshUnread, setUnread, useUnreadCount } from '@/messages/unread';
import { FontFiles, useTokens } from '@/theme';
import { ArchFrame, DesignIcon, type DesignIconName } from '@/ui';

/** How often the red dot checks for new messages when the Messages tab isn't open. */
const BADGE_CHECK_MS = 30000;

/**
 * The bottom tab bar, exactly as in home.html: Accueil, Explorer, Vendre, Messages,
 * Profil. Cream bar with a thin top border, the design's line icons (22px; terracotta
 * and 1.9 thick when selected, grey and 1.7 otherwise), 11px labels (bold terracotta
 * when selected), and Vendre's white "+" in a 44 x 44 terracotta arch, raised by 8px.
 *
 * Home, Explorer and Profil are open to everyone (logged-out visitors see the Welcome
 * on Profil). Vendre and Messages need a login: tapping them opens Log in first.
 * Vendre also needs a verified phone: unverified users go to the verification screen.
 * (The screens' files keep their old names - search.tsx, messages.tsx - so links work.)
 */
export default function TabLayout() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { status, user } = useAuth();
  const unread = useUnreadCount();
  const tk = useTokens();
  const insets = useSafeAreaInsets();

  // Keep the dots up to date while logged in (messages tab, Home's bell); reset when logged out.
  useEffect(() => {
    if (status !== 'signedIn') {
      setUnread(0);
      setNotificationsUnread(0);
      return;
    }
    const check = () => {
      refreshUnread();
      refreshNotificationsUnread();
    };
    check();
    const timer = setInterval(check, BADGE_CHECK_MS);
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

  /** A tab's icon: the design's path, terracotta and thicker when selected. */
  const icon =
    (name: DesignIconName) =>
    ({ focused }: { focused: boolean }) => (
      <DesignIcon
        name={name}
        size={22}
        color={focused ? tk.color.primary : tk.color.textSecondary}
        strokeWidth={focused ? 1.9 : 1.7}
      />
    );

  /** A tab's label: 11px, bold terracotta when selected, medium grey otherwise. */
  const label =
    (text: string) =>
    ({ focused }: { focused: boolean }) => (
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          language === 'ar' && styles.labelArabic,
          {
            color: focused ? tk.color.primary : tk.color.textSecondary,
            fontFamily:
              language === 'ar'
                ? focused
                  ? FontFiles.arabicBold
                  : FontFiles.arabic
                : focused
                  ? FontFiles.bold
                  : FontFiles.medium,
          },
        ]}>
        {text}
      </Text>
    );

  // 86 high in the design, of which 20 is the space at the bottom of the phone.
  const bottomSpace = Math.max(insets.bottom, 20);

  return (
    <Tabs
      screenOptions={{
        headerTitleAlign: 'center',
        // Screen titles (e.g. "Vendre un article") in Fraunces, Noto Naskh Arabic in Arabic.
        headerTitleStyle: { fontFamily: language === 'ar' ? FontFiles.arabicBold : FontFiles.serifBold, fontSize: 19 },
        tabBarStyle: {
          backgroundColor: tk.color.surface,
          borderTopColor: tk.color.border,
          borderTopWidth: 1,
          height: 66 + bottomSpace,
          paddingBottom: bottomSpace,
          paddingTop: 0,
        },
        tabBarItemStyle: styles.item,
        headerStyle: { backgroundColor: tk.color.background },
        headerShadowVisible: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarLabel: label(t('tabs.home')),
          tabBarIcon: icon('home'),
          headerShown: false, // Home draws its own header (greeting, logo, bell)
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('tabs.search'),
          tabBarLabel: label(t('tabs.search')),
          tabBarIcon: icon('search'),
          headerShown: false, // draws its own title ("Explorer" + تصفّح)
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: t('tabs.sell'),
          tabBarLabel: label(t('tabs.sell')),
          tabBarIcon: () => (
            <ArchFrame width={44} height={44} color={tk.brand.terracotta} bottomRadius={12} style={styles.sell}>
              <View style={styles.sellInner}>
                <DesignIcon name="plus" size={20} color={tk.brand.white} strokeWidth={2.2} />
              </View>
            </ArchFrame>
          ),
          tabBarAccessibilityLabel: t('tabs.sell'),
          // The 44px arch is raised by 8px: give it 36px of room, so "Vendre" sits under
          // it (a little lower than the other labels, as in the design).
          tabBarIconStyle: styles.sellIconBox,
        }}
        listeners={needsLogin('sell', true)}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages'),
          tabBarLabel: label(t('tabs.messages')),
          tabBarIcon: icon('message'),
          headerShown: false, // draws its own title ("Messages" + الرسائل)
          // A small dot when there are unread messages (the number is read aloud).
          tabBarBadge: unread > 0 ? '' : undefined,
          tabBarBadgeStyle: [styles.dot, { backgroundColor: tk.color.primary }],
          tabBarAccessibilityLabel:
            unread > 0 ? t('tabs.messagesUnread', { count: unread }) : t('tabs.messages'),
        }}
        listeners={needsLogin('messages')}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarLabel: label(t('tabs.profile')), tabBarIcon: icon('person') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  item: { justifyContent: 'center', gap: 4, paddingTop: 0 },
  label: { fontSize: 11, lineHeight: 15 },
  labelArabic: { lineHeight: 18 },
  sell: { marginTop: -8 },
  sellIconBox: { width: 44, height: 36, marginBottom: 4, overflow: 'visible' },
  sellInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dot: {
    minWidth: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    top: 2,
    fontSize: 1,
    lineHeight: 9,
    color: 'transparent',
  },
});
