import { Image } from 'expo-image';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { fetchOrders, type Order } from '@/api/delivery';
import { FeedMessage } from '@/components/feed-message';
import { StatusBadge } from '@/components/order-parts';
import { RequireAuth } from '@/components/require-auth';
import { useLanguage } from '@/i18n/language-provider';
import { FontFiles, useTokens } from '@/theme';
import { AppText, ArchFrame } from '@/ui';
import { formatPrice } from '@/utils/format';

/** "Mes commandes": every delivery where I am the buyer or the seller, newest first. */
function OrdersContent() {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrders((await fetchOrders(1)).results);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (orders === null) {
    return failed ? (
      <FeedMessage kind="message" icon="cloud-offline-outline" text={t('home.error')} buttonLabel={t('home.retry')} onPress={load} />
    ) : (
      <FeedMessage kind="loading" text={t('home.loading')} />
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: tk.color.background }}
      data={orders}
      keyExtractor={(order) => String(order.id)}
      contentContainerStyle={[styles.list, !orders.length && styles.empty]}
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
      ListEmptyComponent={<FeedMessage kind="message" icon="cube-outline" text={t('delivery.noOrders')} />}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/order/${item.id}` as Href)}
          accessibilityRole="button"
          accessibilityLabel={`${item.listing.title}, ${t(`delivery.status.${item.status}`)}`}
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface, borderColor: tk.color.border },
          ]}>
          <ArchFrame width={52} height={58} color={tk.tints[item.id % tk.tints.length]} bottomRadius={10}>
            {item.listing.cover_photo ? (
              <Image source={{ uri: item.listing.cover_photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : null}
          </ArchFrame>
          <View style={[styles.flex, { gap: 3 }]}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {item.listing.title}
            </AppText>
            <AppText variant="small" tone="secondary" numberOfLines={1}>
              {item.i_am === 'seller'
                ? t('delivery.youSell', { name: item.other_person.display_name })
                : t('delivery.youBuy', { name: item.other_person.display_name })}
            </AppText>
            <StatusBadge status={item.status} />
          </View>
          <Text style={[styles.total, { color: tk.color.primary, fontFamily: language === 'ar' ? FontFiles.arabicBold : FontFiles.serifBold }]}>
            {formatPrice(item.total_to_pay_dzd, language)}
          </Text>
        </Pressable>
      )}
    />
  );
}

export default function OrdersScreen() {
  return (
    <RequireAuth next="/orders">
      <OrdersContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 20, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  empty: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: 20 },
  total: { fontSize: 15, lineHeight: 20 },
});
