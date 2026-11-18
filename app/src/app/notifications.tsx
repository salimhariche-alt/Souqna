import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { fetchNotifications, markNotificationsRead, type AppNotification } from '@/api/delivery';
import { FeedMessage } from '@/components/feed-message';
import { statusTone } from '@/components/order-parts';
import { RequireAuth } from '@/components/require-auth';
import { useLanguage } from '@/i18n/language-provider';
import { setNotificationsUnread } from '@/messages/notifications-unread';
import { useTokens } from '@/theme';
import { AppText, ArchFrame, DesignIcon } from '@/ui';
import { dateAndTime } from '@/utils/chat-time';

/** Notifications (Home's bell): delivery news, newest first. Opening the page marks them read. */
function NotificationsContent() {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await fetchNotifications(1);
      setItems(page.results);
      setFailed(false);
      if (page.results.some((n) => !n.read)) {
        await markNotificationsRead();
      }
      setNotificationsUnread(0);
    } catch {
      setFailed(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (items === null) {
    return failed ? (
      <FeedMessage kind="message" icon="cloud-offline-outline" text={t('home.error')} buttonLabel={t('home.retry')} onPress={load} />
    ) : (
      <FeedMessage kind="loading" text={t('home.loading')} />
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: tk.color.background }}
      data={items}
      keyExtractor={(n) => String(n.id)}
      contentContainerStyle={[styles.list, !items.length && styles.empty]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      ListEmptyComponent={<FeedMessage kind="message" icon="notifications-outline" text={t('delivery.noNotifications')} />}
      renderItem={({ item }) => {
        const tone = statusTone(item.status);
        const tint =
          tone === 'success' ? tk.color.successSoft : tone === 'danger' ? tk.color.dangerSoft : tk.color.tint1;
        const iconColor =
          tone === 'success' ? tk.color.success : tone === 'danger' ? tk.color.danger : tk.brand.ink;
        return (
          <Pressable
            onPress={() => item.order && router.push(`/order/${item.order}` as Href)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface,
                borderColor: item.read ? tk.color.border : tk.color.primary,
              },
            ]}>
            <ArchFrame width={40} height={44} color={tint} bottomRadius={8}>
              <View style={styles.center}>
                <DesignIcon name="truck" size={20} color={iconColor} strokeWidth={1.7} />
              </View>
            </ArchFrame>
            <View style={[styles.flex, { gap: 2 }]}>
              <AppText variant={item.read ? 'body' : 'bodyStrong'}>
                {t(`delivery.notify.${item.status}`, { title: item.listing_title })}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {dateAndTime(item.created_at, language)}
              </AppText>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

export default function NotificationsScreen() {
  return (
    <RequireAuth next="/notifications">
      <NotificationsContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  list: { padding: 20, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  empty: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: 20 },
});
