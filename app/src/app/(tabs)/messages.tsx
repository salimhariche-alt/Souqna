import { Image } from 'expo-image';
import { router, useFocusEffect, type Href } from 'expo-router';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { fetchConversations, type ConversationSummary } from '@/api/conversations';
import { FeedMessage } from '@/components/feed-message';
import { PageTitle } from '@/components/page-title';
import { RequireAuth } from '@/components/require-auth';
import { ThemedText } from '@/components/themed-text';
import { useLanguage } from '@/i18n/language-provider';
import { refreshUnread, setUnread } from '@/messages/unread';
import { FontFiles, useTokens } from '@/theme';
import { ArchFrame, DesignIcon } from '@/ui';
import { shortStamp } from '@/utils/chat-time';
import { formatPrice } from '@/utils/format';
import { formatDuration } from '@/voice/recording';

/** While this tab is open, look for new messages this often. */
const CHECK_EVERY_MS = 15000;

/**
 * Messages ("Warm & Local"): the title "Messages" + الرسائل, then one cream card per
 * conversation (the listing photo in an arch, the person, the listing and price, the
 * last message, the time and a terracotta unread count).
 */
function MessagesContent() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadingMore = useRef(false);

  /** Reload the first page (the newest activity). Keeps the list on screen if it fails. */
  const loadFirstPage = useCallback(async () => {
    try {
      const page = await fetchConversations(1);
      setConversations(page.results);
      setNextPage(page.next ? 2 : null);
      setFailed(false);
      // The list knows every unread count on page 1; the badge asks the server for the total.
      if (!page.next) setUnread(page.results.reduce((sum, c) => sum + c.unread_count, 0));
      else refreshUnread();
    } catch {
      setFailed(true);
    }
  }, []);

  // When the tab is shown: load now, then every 15 seconds until it's hidden again.
  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
      const timer = setInterval(loadFirstPage, CHECK_EVERY_MS);
      return () => clearInterval(timer);
    }, [loadFirstPage]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (!nextPage || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await fetchConversations(nextPage);
      setConversations((current) => {
        const known = new Set(current?.map((c) => c.id));
        return [...(current ?? []), ...page.results.filter((c) => !known.has(c.id))];
      });
      setNextPage(page.next ? nextPage + 1 : null);
    } catch {
      // Ignore: the user can scroll again to retry.
    } finally {
      loadingMore.current = false;
    }
  };

  if (conversations === null) {
    return failed ? (
      <FeedMessage
        kind="message"
        icon="cloud-offline-outline"
        text={t('home.error')}
        buttonLabel={t('home.retry')}
        onPress={loadFirstPage}
      />
    ) : (
      <FeedMessage kind="loading" text={t('messages.loading')} />
    );
  }

  return (
    <FlatList
      data={conversations}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => <ConversationRow conversation={item} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={[styles.list, { paddingTop: insets.top + 24 }, !conversations.length && styles.emptyList]}
      ListHeaderComponent={
        <View style={styles.header}>
          <PageTitle title={t('tabs.messages')} arabic={t('messages.titleArabic')} />
          {failed ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.offline}>
              {t('home.refreshFailed')}
            </ThemedText>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <FeedMessage
          kind="message"
          icon="chatbubbles-outline"
          text={t('messages.empty')}
          buttonLabel={t('messages.browse')}
          onPress={() => router.navigate('/')}
        />
      }
    />
  );
}

function ConversationRow({ conversation }: { conversation: ConversationSummary }) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language, direction } = useLanguage();
  const { listing, other_person, last_message, unread_count } = conversation;
  const unread = unread_count > 0;
  const align = { textAlign: direction === 'rtl' ? 'right' : 'left' } as const;
  const words = { today: t('chat.today'), yesterday: t('chat.yesterday') };

  const preview = last_message
    ? (last_message.is_mine ? t('messages.you') : '') +
      (last_message.hidden
        ? t('moderation.hiddenPreview')
        : last_message.offer
          ? t(`offers.preview.${last_message.offer.event}`, {
              price: formatPrice(last_message.offer.amount_dzd, language),
            })
          : last_message.is_voice
            ? t('voice.preview', { duration: formatDuration(last_message.duration_ms) })
            : last_message.text.replace(/\s+/g, ' '))
    : '';

  return (
    <Pressable
      onPress={() => router.push(`/chat/${conversation.id}` as Href)}
      accessibilityRole="button"
      accessibilityLabel={t('messages.rowLabel', {
        name: other_person.display_name,
        title: listing.title,
        count: unread_count,
      })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface, borderColor: tk.color.border },
      ]}>
      {/* The listing's photo in a small arch */}
      <ArchFrame width={52} height={58} color={tk.tints[listing.id % tk.tints.length]} bottomRadius={10}>
        {listing.cover_photo ? (
          <Image source={{ uri: listing.cover_photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={styles.noPhoto}>
            <DesignIcon name="bag" size={24} color={tk.color.textSecondary} strokeWidth={1.2} />
          </View>
        )}
      </ArchFrame>

      <View style={styles.middle}>
        <View style={styles.topLine}>
          <ThemedText type="smallBold" style={[styles.name, align]} numberOfLines={1}>
            {other_person.display_name}
          </ThemedText>
          <ThemedText
            type="small"
            style={[styles.time, unread && styles.timeUnread]}
            themeColor={unread ? 'primary' : 'textSecondary'}>
            {shortStamp(last_message?.sent_at ?? conversation.last_activity, words)}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={[styles.listingLine, align]} numberOfLines={1}>
          {listing.title} · {formatPrice(listing.price_dzd, language)}
          {listing.status === 'sold' ? ` · ${t('listing.sold')}` : ''}
        </ThemedText>
        <View style={styles.bottomLine}>
          <ThemedText
            type={unread ? 'smallBold' : 'small'}
            themeColor={unread ? 'text' : 'textSecondary'}
            style={[styles.preview, align]}
            numberOfLines={1}>
            {preview}
          </ThemedText>
          {unread && (
            <View style={[styles.badge, { backgroundColor: tk.color.primary }]}>
              <Text style={[styles.badgeText, { color: tk.color.onPrimary }]}>
                {unread_count > 99 ? '99+' : unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function Background({ children }: { children: ReactNode }) {
  const tk = useTokens();
  return <View style={[styles.screen, { backgroundColor: tk.color.background }]}>{children}</View>;
}

export default function MessagesScreen() {
  return (
    <RequireAuth next="/messages">
      <Background>
        <MessagesContent />
      </Background>
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingHorizontal: 20, paddingBottom: 24, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  emptyList: { flexGrow: 1 },
  header: { gap: 8, marginBottom: 10 },
  offline: { textAlign: 'center', padding: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: 20 },
  noPhoto: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  middle: { flex: 1, gap: 1 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 15 },
  time: { fontSize: 12 },
  timeUnread: { fontFamily: FontFiles.bold },
  listingLine: { fontSize: 13 },
  bottomLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  preview: { flex: 1 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: FontFiles.bold, fontSize: 12, lineHeight: 16 },
});
