import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import {
  fetchConversation,
  sendMessage,
  sendVoiceMessage,
  type ChatMessage,
  type ConversationDetail,
} from '@/api/conversations';
import { blockUser, unblockUser } from '@/api/safety';
import { useAuth } from '@/auth/auth-provider';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FeedMessage } from '@/components/feed-message';
import { MAX_MESSAGE_LENGTH } from '@/components/message-sheet';
import { MoreButton, OptionsMenu } from '@/components/options-menu';
import { ReportSheet } from '@/components/report-sheet';
import { RequireAuth } from '@/components/require-auth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formErrorsFrom } from '@/i18n/api-errors';
import { useLanguage } from '@/i18n/language-provider';
import { refreshUnread } from '@/messages/unread';
import { clock, dayKey, dayLabel } from '@/utils/chat-time';
import { formatPrice } from '@/utils/format';
import { formatDuration } from '@/voice/recording';
import { VoiceRecorderButton, type RecordingState } from '@/voice/voice-recorder';

/** While the chat is open, look for new messages this often. */
const CHECK_EVERY_MS = 5000;

/** Voice error codes from the server -> translation keys. */
const VOICE_ERRORS: Record<string, string> = {
  voice_daily_limit: 'voice.errors.dailyLimit',
  audio_too_long: 'voice.errors.tooLong',
  audio_too_big: 'voice.errors.tooBig',
  audio_too_short: 'voice.holdHint',
  audio_not_supported: 'voice.errors.notSupported',
};

/** A message I wrote (or recorded) that isn't confirmed by the server yet. */
type Pending = {
  localId: string;
  kind: 'text' | 'voice';
  text: string;
  /** Voice: the recording on the phone, and its length. */
  uri?: string;
  durationMs?: number;
  status: 'sending' | 'failed';
  createdAt: string;
};

/** The first received voice message shows a safety tip once (remembered on this phone). */
const VOICE_TIP_KEY = 'souqna.voiceTipSeen';

type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'message'; key: string; message: ChatMessage }
  | { kind: 'pending'; key: string; pending: Pending };

function ChatContent({ id }: { id: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { language, direction } = useLanguage();
  const { user } = useAuth();

  const [conversation, setConversation] = useState<Omit<ConversationDetail, 'messages'> | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'notFound' | 'error'>('loading');
  const [text, setText] = useState('');
  const [sendError, setSendError] = useState<string>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: 'user' | 'message'; id: number } | null>(
    null,
  );
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [recording, setRecording] = useState<RecordingState | null>(null);
  const [hint, setHint] = useState<string>();
  const [voiceTipSeen, setVoiceTipSeen] = useState(true);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One player for the whole chat, so only one voice message plays at a time.
  const player = useAudioPlayer(null);
  const playback = useAudioPlayerStatus(player);
  const [playingId, setPlayingId] = useState<number | null>(null);

  const lastId = useRef<number | undefined>(undefined);
  const nextLocalId = useRef(0);
  const align = { textAlign: direction === 'rtl' ? 'right' : 'left', writingDirection: direction } as const;

  /** Add messages from the server (ignoring ones we already have). */
  const addMessages = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((current) => {
      const known = new Set(current.map((m) => m.id));
      const merged = [...current, ...incoming.filter((m) => !known.has(m.id))];
      merged.sort((a, b) => a.id - b.id);
      lastId.current = merged[merged.length - 1]?.id;
      return merged;
    });
  }, []);

  /** First load: everything. Later checks: only messages newer than the last one. */
  const load = useCallback(async () => {
    try {
      const { messages: incoming, ...rest } = await fetchConversation(id, lastId.current);
      setConversation(rest);
      addMessages(incoming);
      setLoadState('ready');
      if (incoming.some((m) => !m.is_mine)) refreshUnread(); // they're now read
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setLoadState('notFound');
      else setLoadState((state) => (state === 'ready' ? state : 'error')); // keep the chat shown
    }
  }, [id, addMessages]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, CHECK_EVERY_MS);
      return () => {
        clearInterval(timer);
        player.pause(); // stop any voice message when leaving the chat
      };
    }, [load, player]),
  );

  // Has this user already seen the voice-message safety tip?
  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(`${VOICE_TIP_KEY}.${user.id}`)
      .then((value) => setVoiceTipSeen(value === '1'))
      .catch(() => setVoiceTipSeen(true));
  }, [user]);

  const dismissVoiceTip = () => {
    setVoiceTipSeen(true);
    if (user) AsyncStorage.setItem(`${VOICE_TIP_KEY}.${user.id}`, '1').catch(() => {});
  };

  /** A short explanation above the text box, for a few seconds. */
  const showHint = (message: string) => {
    setHint(message);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(undefined), 5000);
  };

  // Playing voice messages ----------------------------------------------------------
  const togglePlay = (message: ChatMessage) => {
    if (!message.audio) return;
    if (playingId === message.id) {
      if (playback.playing) {
        player.pause();
      } else {
        // Finished? Start again from the beginning.
        if (playback.duration && playback.currentTime >= playback.duration - 0.1) player.seekTo(0);
        player.play();
      }
      return;
    }
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    player.replace({ uri: message.audio });
    setPlayingId(message.id);
    player.play();
  };

  // Sending ---------------------------------------------------------------------------
  const deliver = async (item: Pending) => {
    setPending((list) =>
      list.map((p) => (p.localId === item.localId ? { ...p, status: 'sending' } : p)),
    );
    try {
      const sent =
        item.kind === 'voice' && item.uri
          ? await sendVoiceMessage(id, item.uri)
          : await sendMessage(id, item.text);
      setPending((list) => list.filter((p) => p.localId !== item.localId));
      addMessages([sent]);
      setSendError(undefined);
      if (item.kind === 'voice') load(); // refresh the "voice messages left today"
    } catch (error) {
      setPending((list) =>
        list.map((p) => (p.localId === item.localId ? { ...p, status: 'failed' } : p)),
      );
      const data = error instanceof ApiError ? (error.data as { code?: string; limit?: number } | null) : null;
      const code = data?.code;
      if (code === 'blocked') load(); // shows the "blocked" note
      else if (code === 'phone_not_verified') askToVerify();
      else if (code && code in VOICE_ERRORS) {
        setSendError(t(VOICE_ERRORS[code], { limit: data?.limit }));
        load();
      } else if (error instanceof ApiError && !error.isNetworkError) {
        setSendError(formErrorsFrom(error, t, { text: 'text' }).fields.text ?? undefined);
      }
    }
  };

  const askToVerify = () =>
    router.push({ pathname: '/verify-phone', params: { next: `/chat/${id}` } } as Href);

  const onSend = () => {
    const trimmed = text.trim();
    if (!trimmed || !user) return;
    // Safety: a verified phone first, then the "Buy safely" tips once. The text stays.
    if (!user.phone_verified) return askToVerify();
    if (!user.safety_tips_seen) return router.push('/buy-safely' as Href);
    const item: Pending = {
      localId: `local-${nextLocalId.current++}`,
      kind: 'text',
      text: trimmed,
      status: 'sending',
      createdAt: new Date().toISOString(),
    };
    setPending((list) => [...list, item]);
    setText('');
    setSendError(undefined);
    deliver(item);
  };

  // Voice messages --------------------------------------------------------------------
  /** Same safety checks as text, before the microphone starts. */
  const canRecord = () => {
    if (!user) return false;
    if (!user.phone_verified) {
      askToVerify();
      return false;
    }
    if (!user.safety_tips_seen) {
      router.push('/buy-safely' as Href);
      return false;
    }
    return true;
  };

  const sendVoice = (uri: string, durationMs: number) => {
    const item: Pending = {
      localId: `local-${nextLocalId.current++}`,
      kind: 'voice',
      text: '',
      uri,
      durationMs,
      status: 'sending',
      createdAt: new Date().toISOString(),
    };
    setPending((list) => [...list, item]);
    setSendError(undefined);
    deliver(item);
  };

  // Blocking ------------------------------------------------------------------------
  const other = conversation?.other_person;
  const blockedByMe = conversation?.blocked.by_me ?? false;
  const blocked = blockedByMe || (conversation?.blocked.by_them ?? false);

  const block = async () => {
    if (!other) return;
    setBlocking(true);
    try {
      await blockUser(other.id);
      setConfirmBlock(false);
      await load();
    } catch {
      setSendError(t('listing.actionFailed'));
      setConfirmBlock(false);
    } finally {
      setBlocking(false);
    }
  };

  const unblock = async () => {
    if (!other) return;
    try {
      await unblockUser(other.id);
      await load();
    } catch {
      setSendError(t('listing.actionFailed'));
    }
  };

  // Rows: messages grouped by day, newest at the bottom (the list is drawn upside down).
  const rows = useMemo(() => {
    const words = { today: t('chat.today'), yesterday: t('chat.yesterday') };
    const items: Row[] = [];
    let previousDay: number | null = null;
    const addDay = (date: string) => {
      const day = dayKey(date);
      if (day !== previousDay) {
        items.push({ kind: 'day', key: `day-${day}`, label: dayLabel(date, language, words) });
        previousDay = day;
      }
    };
    for (const message of messages) {
      addDay(message.sent_at);
      items.push({ kind: 'message', key: `m-${message.id}`, message });
    }
    for (const item of pending) {
      addDay(item.createdAt);
      items.push({ kind: 'pending', key: item.localId, pending: item });
    }
    return items.reverse();
  }, [messages, pending, language, t]);

  if (loadState === 'loading') return <FeedMessage kind="loading" text={t('messages.loading')} />;
  if (loadState === 'notFound') {
    return <FeedMessage kind="message" icon="search-outline" text={t('chat.notFound')} />;
  }
  if (loadState === 'error' || !conversation || !other) {
    return (
      <FeedMessage
        kind="message"
        icon="cloud-offline-outline"
        text={t('home.error')}
        buttonLabel={t('home.retry')}
        onPress={() => {
          setLoadState('loading');
          load();
        }}
      />
    );
  }

  const { listing, voice } = conversation;
  // Voice messages: phone app only, within today's limit.
  const voiceAvailable = Platform.OS !== 'web' && voice.left_today > 0;
  const voiceUnavailableReason =
    Platform.OS === 'web' ? t('voice.phoneOnly') : t('voice.errors.dailyLimit', { limit: voice.limit });

  return (
    <>
      <Stack.Screen
        options={{
          title: other.display_name,
          headerRight: () => <MoreButton onPress={() => setMenuOpen(true)} />,
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={headerHeight}>
        {/* The listing this conversation is about. */}
        <Pressable
          onPress={() => router.push(`/listing/${listing.id}` as Href)}
          accessibilityRole="button"
          accessibilityLabel={t('chat.openListing', { title: listing.title })}
          style={({ pressed }) => [
            styles.listingCard,
            { borderBottomColor: theme.backgroundSelected },
            pressed && styles.pressed,
          ]}>
          {listing.cover_photo ? (
            <Image source={{ uri: listing.cover_photo }} style={styles.listingPhoto} contentFit="cover" />
          ) : (
            <View style={[styles.listingPhoto, { backgroundColor: theme.backgroundSelected }]} />
          )}
          <View style={styles.flex}>
            <ThemedText type="smallBold" style={align} numberOfLines={1}>
              {listing.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={align}>
              {formatPrice(listing.price_dzd, language)}
            </ThemedText>
          </View>
          {listing.status !== 'active' && (
            <View
              style={[
                styles.statusBadge,
                listing.status === 'sold' ? styles.soldBadge : styles.reservedBadge,
              ]}>
              <ThemedText type="smallBold" style={styles.statusText}>
                {listing.status === 'sold' ? t('listing.sold') : t('listing.reserved')}
              </ThemedText>
            </View>
          )}
          <Ionicons
            name={direction === 'rtl' ? 'chevron-back' : 'chevron-forward'}
            size={18}
            color={theme.textSecondary}
          />
        </Pressable>
        {listing.status === 'sold' && (
          <View style={styles.soldNote}>
            <ThemedText type="small" style={[styles.soldNoteText, styles.center]}>
              {t('listing.soldNotice')}
            </ThemedText>
          </View>
        )}
        {/* Shown once, the first time this person receives a voice message. */}
        {!voiceTipSeen && messages.some((m) => !m.is_mine && m.kind === 'voice') && (
          <View style={styles.voiceTip} accessibilityRole="alert">
            <Ionicons name="shield-checkmark-outline" size={20} color="#7A5A00" />
            <ThemedText type="small" style={[styles.flex, styles.warningText, align]}>
              {t('voice.tip')}
            </ThemedText>
            <Pressable onPress={dismissVoiceTip} accessibilityRole="button" hitSlop={8}>
              <ThemedText type="smallBold" style={styles.link}>
                {t('voice.tipOk')}
              </ThemedText>
            </Pressable>
          </View>
        )}

        <FlatList
          data={rows}
          inverted
          keyExtractor={(row) => row.key}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            // Shown at the top (the list is upside down).
            <ThemedText type="small" themeColor="textSecondary" style={[styles.center, styles.hint]}>
              {t('chat.reportHint')}
            </ThemedText>
          }
          renderItem={({ item }) => {
            if (item.kind === 'day') {
              return (
                <View style={styles.dayRow}>
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={[styles.dayLabel, { backgroundColor: theme.backgroundElement }]}>
                    {item.label}
                  </ThemedText>
                </View>
              );
            }
            if (item.kind === 'pending') {
              return (
                <Bubble
                  mine
                  text={item.pending.text}
                  body={
                    item.pending.kind === 'voice' ? (
                      <VoicePlayer
                        mine
                        durationMs={item.pending.durationMs ?? 0}
                        playing={false}
                        progress={0}
                      />
                    ) : undefined
                  }>
                  {item.pending.status === 'sending' ? (
                    <ThemedText type="small" style={styles.mineMeta}>
                      {t('chat.sending')}
                    </ThemedText>
                  ) : (
                    <Pressable
                      onPress={() => deliver(item.pending)}
                      accessibilityRole="button"
                      hitSlop={8}>
                      <ThemedText type="smallBold" style={styles.failed}>
                        {t('chat.failed')}
                      </ThemedText>
                    </Pressable>
                  )}
                </Bubble>
              );
            }
            const { message } = item;
            const isPlaying = playingId === message.id;
            return (
              <View>
                <Bubble
                  mine={message.is_mine}
                  text={message.text}
                  body={
                    message.kind === 'voice' ? (
                      <VoicePlayer
                        mine={message.is_mine}
                        durationMs={message.duration_ms ?? 0}
                        playing={isPlaying && playback.playing}
                        progress={
                          isPlaying && playback.duration
                            ? Math.min(1, playback.currentTime / playback.duration)
                            : 0
                        }
                        onToggle={() => togglePlay(message)}
                      />
                    ) : undefined
                  }
                  onLongPress={
                    message.is_mine
                      ? undefined
                      : () => setReportTarget({ type: 'message', id: message.id })
                  }>
                  <ThemedText
                    type="small"
                    style={message.is_mine ? styles.mineMeta : undefined}
                    themeColor={message.is_mine ? undefined : 'textSecondary'}>
                    {clock(message.sent_at)}
                  </ThemedText>
                </Bubble>
                {!message.is_mine && message.warnings.length > 0 && (
                  <View style={styles.warning} accessibilityRole="alert">
                    <Ionicons name="warning-outline" size={18} color="#7A5A00" />
                    <ThemedText type="small" style={[styles.warningText, align]}>
                      {t('chat.warning')}
                    </ThemedText>
                  </View>
                )}
              </View>
            );
          }}
        />

        {/* Bottom: the text box, or why messages can't be sent. */}
        <ThemedView
          style={[
            styles.composer,
            { borderTopColor: theme.backgroundSelected, paddingBottom: insets.bottom + Spacing.two },
          ]}>
          {blocked ? (
            <View style={styles.blockedNote}>
              <Ionicons name="ban-outline" size={20} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary" style={[styles.flex, align]}>
                {blockedByMe
                  ? t('chat.blockedByMe', { name: other.display_name })
                  : t('chat.blockedByThem')}
              </ThemedText>
              {blockedByMe && (
                <Pressable onPress={unblock} accessibilityRole="button" hitSlop={8}>
                  <ThemedText type="smallBold" style={styles.link}>
                    {t('block.unblock')}
                  </ThemedText>
                </Pressable>
              )}
            </View>
          ) : (
            <>
              {sendError || hint ? (
                <ThemedText
                  type="small"
                  style={[sendError ? styles.failed : styles.hintText, align]}
                  accessibilityLiveRegion="polite">
                  {sendError ?? hint}
                </ThemedText>
              ) : null}
              <View style={styles.inputRow}>
                {recording ? (
                  // While recording: a red dot, the timer, and how to cancel.
                  <View
                    style={[styles.input, styles.recordingRow, { backgroundColor: theme.backgroundElement }]}>
                    <View style={styles.recordDot} />
                    <ThemedText type="smallBold">{formatDuration(recording.elapsedMs)}</ThemedText>
                    <ThemedText
                      type="small"
                      style={[styles.flex, align, recording.cancelling ? styles.failed : undefined]}
                      themeColor={recording.cancelling ? undefined : 'textSecondary'}
                      numberOfLines={1}>
                      {recording.cancelling ? t('voice.releaseToCancel') : t('voice.slideToCancel')}
                    </ThemedText>
                  </View>
                ) : (
                  <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder={t('chat.placeholder')}
                    placeholderTextColor={theme.textSecondary}
                    accessibilityLabel={t('chat.placeholder')}
                    multiline
                    maxLength={MAX_MESSAGE_LENGTH}
                    style={[
                      styles.input,
                      { backgroundColor: theme.backgroundElement, color: theme.text },
                      align,
                    ]}
                  />
                )}
                {text.trim() && !recording ? (
                  <Pressable
                    onPress={onSend}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.send')}
                    style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}>
                    {/* The arrow points the way you read: right in French, left in Arabic. */}
                    <Ionicons
                      name="send"
                      size={20}
                      color="#ffffff"
                      style={direction === 'rtl' ? styles.flipped : undefined}
                    />
                  </Pressable>
                ) : (
                  <VoiceRecorderButton
                    disabled={!voiceAvailable}
                    onUnavailablePress={() => showHint(voiceUnavailableReason)}
                    canStart={canRecord}
                    onRecorded={sendVoice}
                    onStateChange={setRecording}
                    onTooShort={() => showHint(t('voice.holdHint'))}
                  />
                )}
              </View>
            </>
          )}
        </ThemedView>
      </KeyboardAvoidingView>

      <OptionsMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        options={[
          {
            label: t('chat.reportUser'),
            icon: 'flag-outline',
            onPress: () => setReportTarget({ type: 'user', id: other.id }),
          },
          blockedByMe
            ? { label: t('block.unblock'), icon: 'checkmark-circle-outline', onPress: unblock }
            : {
                label: t('chat.blockUser'),
                icon: 'ban-outline',
                onPress: () => setConfirmBlock(true),
                danger: true,
              },
        ]}
      />
      <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
      <ConfirmDialog
        visible={confirmBlock}
        title={t('block.confirmTitle', { name: other.display_name })}
        message={t('block.confirmMessage')}
        confirmLabel={t('block.confirm')}
        cancelLabel={t('listing.cancel')}
        onConfirm={block}
        onCancel={() => setConfirmBlock(false)}
        loading={blocking}
        danger
      />
    </>
  );
}

/** Play/pause, a progress bar and the duration of a voice message. */
function VoicePlayer({
  mine,
  durationMs,
  playing,
  progress,
  onToggle,
}: {
  mine: boolean;
  durationMs: number;
  playing: boolean;
  /** 0-1 */
  progress: number;
  onToggle?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const color = mine ? '#ffffff' : '#208AEF';
  return (
    <View style={styles.voiceRow}>
      <Pressable
        onPress={onToggle}
        disabled={!onToggle}
        accessibilityRole="button"
        accessibilityLabel={playing ? t('voice.pause') : t('voice.play')}
        hitSlop={8}>
        <Ionicons name={playing ? 'pause' : 'play'} size={26} color={color} />
      </Pressable>
      <View
        style={[
          styles.voiceTrack,
          { backgroundColor: mine ? 'rgba(255,255,255,0.35)' : theme.backgroundSelected },
        ]}>
        <View
          style={[styles.voiceProgress, { width: `${progress * 100}%`, backgroundColor: color }]}
        />
      </View>
      <ThemedText
        type="small"
        style={mine ? styles.mineMeta : undefined}
        themeColor={mine ? undefined : 'textSecondary'}>
        {formatDuration(durationMs)}
      </ThemedText>
    </View>
  );
}

/** One chat bubble: mine at the end of the line (blue), theirs at the start (grey). */
function Bubble({
  mine,
  text,
  body,
  onLongPress,
  children,
}: {
  mine: boolean;
  text: string;
  /** Instead of the text, e.g. a voice player. */
  body?: React.ReactNode;
  onLongPress?: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const { direction } = useLanguage();
  const { t } = useTranslation();
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityHint={onLongPress ? t('chat.longPressHint') : undefined}
      style={[
        styles.bubble,
        mine ? styles.mine : [styles.theirs, { backgroundColor: theme.backgroundElement }],
      ]}>
      {body ?? (
        <ThemedText
          style={[
            mine ? styles.mineText : undefined,
            { textAlign: direction === 'rtl' ? 'right' : 'left', writingDirection: 'auto' },
          ]}>
          {text}
        </ThemedText>
      )}
      <View style={styles.meta}>{children}</View>
    </Pressable>
  );
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth next={`/chat/${id}`}>
      <ThemedView style={styles.flex}>
        <ChatContent id={id} />
      </ThemedView>
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  pressed: { opacity: 0.6 },
  listingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listingPhoto: { width: 44, height: 44, borderRadius: Spacing.two },
  statusBadge: { paddingVertical: 2, paddingHorizontal: Spacing.two, borderRadius: 999 },
  soldBadge: { backgroundColor: '#D93025' },
  reservedBadge: { backgroundColor: '#E37400' },
  statusText: { color: '#ffffff', fontSize: 12 },
  soldNote: { backgroundColor: '#FDECEA', paddingVertical: Spacing.two },
  soldNoteText: { color: '#B3261E' },
  messages: {
    padding: Spacing.three,
    gap: Spacing.two,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  hint: { marginBottom: Spacing.two },
  dayRow: { alignItems: 'center', marginVertical: Spacing.two },
  dayLabel: {
    paddingVertical: 2,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    overflow: 'hidden',
  },
  bubble: {
    maxWidth: '80%',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: 2,
  },
  // With direction "rtl" on the screen, flex-start/flex-end flip by themselves in Arabic.
  mine: { alignSelf: 'flex-end', backgroundColor: '#208AEF', borderBottomEndRadius: 4 },
  theirs: { alignSelf: 'flex-start', borderBottomStartRadius: 4 },
  mineText: { color: '#ffffff' },
  meta: { alignSelf: 'flex-end' },
  mineMeta: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  failed: { color: '#D93025' },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    maxWidth: '85%',
    gap: Spacing.two,
    marginTop: Spacing.one,
    padding: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: '#FFF4CC',
  },
  warningText: { flex: 1, color: '#7A5A00' },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    paddingHorizontal: Spacing.three,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 16,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#208AEF',
  },
  sendDisabled: { opacity: 0.4 },
  flipped: { transform: [{ scaleX: -1 }] },
  hintText: { color: '#7A5A00' },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  recordDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#D93025' },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minWidth: 190 },
  voiceTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  voiceProgress: { height: '100%', borderRadius: 2 },
  voiceTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: '#FFF4CC',
  },
  blockedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  link: { color: '#208AEF' },
});
