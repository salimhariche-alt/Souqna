import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { fetchConversations, type ConversationSummary } from '@/api/conversations';
import { FeedMessage } from '@/components/feed-message';
import { RequireAuth } from '@/components/require-auth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language-provider';
import { refreshUnread, setUnread } from '@/messages/unread';
import { shortStamp } from '@/utils/chat-time';
import { formatPrice } from '@/utils/format';
import { formatDuration } from '@/voice/recording';

/** While this tab is open, look for new messages this often. */
const CHECK_EVERY_MS = 15000;

function MessagesContent() {
  const { t } = useTranslation();
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
      contentContainerStyle={conversations.length ? styles.list : styles.emptyList}
      ListHeaderComponent={
        failed ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.offline}>
            {t('home.refreshFailed')}
          </ThemedText>
        ) : undefined
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
  const theme = useTheme();
  const { language, direction } = useLanguage();
  const { listing, other_person, last_message, unread_count } = conversation;
  const unread = unread_count > 0;
  const align = { textAlign: direction === 'rtl' ? 'right' : 'left' } as const;
  const words = { today: t('chat.today'), yesterday: t('chat.yesterday') };

  const preview = last_message
    ? (last_message.is_mine ? t('messages.you') : '') +
      (last_message.is_voice
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
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundElement }]}>
      {listing.cover_photo ? (
        <Image source={{ uri: listing.cover_photo }} style={styles.photo} contentFit="cover" />
      ) : (
        <View style={[styles.photo, styles.noPhoto, { backgroundColor: theme.backgroundSelected }]}>
          <Ionicons name="image-outline" size={22} color={theme.textSecondary} />
        </View>
      )}

      <View style={styles.middle}>
        <View style={styles.topLine}>
          <ThemedText type="smallBold" style={[styles.name, align]} numberOfLines={1}>
            {other_person.display_name}
          </ThemedText>
          <ThemedText
            type="small"
            style={unread ? styles.timeUnread : undefined}
            themeColor={unread ? undefined : 'textSecondary'}>
            {shortStamp(last_message?.sent_at ?? conversation.last_activity, words)}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={align} numberOfLines={1}>
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
            <View style={styles.badge}>
              <ThemedText type="smallBold" style={styles.badgeText}>
                {unread_count > 99 ? '99+' : unread_count}
              </ThemedText>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function MessagesScreen() {
  return (
    <RequireAuth next="/messages">
      <ThemedView style={styles.screen}>
        <MessagesContent />
      </ThemedView>
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingVertical: Spacing.two, width: '100%', maxWidth: 720, alignSelf: 'center' },
  emptyList: { flexGrow: 1 },
  offline: { textAlign: 'center', padding: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  photo: { width: 56, height: 56, borderRadius: Spacing.two },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  middle: { flex: 1, gap: 2 },
  topLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { flex: 1 },
  timeUnread: { color: '#208AEF', fontWeight: '700' },
  bottomLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  preview: { flex: 1 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#208AEF',
  },
  badgeText: { color: '#ffffff', fontSize: 12, lineHeight: 16 },
});
