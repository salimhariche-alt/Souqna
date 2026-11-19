import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ConversationDetail } from '@/api/conversations';
import { fetchOrderForConversation, type Order } from '@/api/delivery';
import { StatusBadge } from '@/components/order-parts';
import { useLanguage } from '@/i18n/language-provider';
import { useTokens } from '@/theme';
import { AppText, ArchFrame, DesignIcon } from '@/ui';

type Props = {
  conversation: Pick<ConversationDetail, 'id' | 'seller' | 'listing'>;
  myId: number | undefined;
  blocked: boolean;
};

/**
 * In the chat, under the listing: the order for this conversation ("Suivre la
 * livraison" with its status, for both people). Orders are placed by the buyer with
 * "Acheter" on the listing page.
 */
export function DeliveryBanner({ conversation }: Props) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { direction } = useLanguage();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      let current = true;
      fetchOrderForConversation(conversation.id)
        .then((found) => current && setOrder(found))
        .catch(() => current && setOrder(null));
      return () => {
        current = false;
      };
    }, [conversation.id]),
  );

  if (!order) return null; // loading, or no order: nothing to show

  return (
    <View style={styles.box}>
      {(
        <Pressable
          onPress={() => router.push(`/order/${order.id}` as Href)}
          accessibilityRole="button"
          accessibilityLabel={`${t('delivery.follow')}, ${t(`delivery.status.${order.status}`)}`}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface, borderColor: tk.color.border },
          ]}>
          <ArchFrame width={36} height={40} color={tk.color.tint4} bottomRadius={8}>
            <View style={styles.center}>
              <DesignIcon name="truck" size={18} color={tk.brand.ink} strokeWidth={1.7} />
            </View>
          </ArchFrame>
          <View style={[styles.flex, { gap: 4 }]}>
            <AppText variant="bodyStrong">{t('delivery.follow')}</AppText>
            <StatusBadge status={order.status} />
          </View>
          <DesignIcon name={direction === 'rtl' ? 'chevronLeft' : 'chevronRight'} size={16} color={tk.color.iconMuted} strokeWidth={1.9} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  box: { marginHorizontal: 12, gap: 8, marginBottom: 4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderWidth: 1, borderRadius: 20 },
});
