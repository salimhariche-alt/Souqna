import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { ApiError, apiFetch } from './client';

export type Person = { id: number; display_name: string };

export type ConversationListing = {
  id: number;
  title: string;
  price_dzd: number;
  status: 'active' | 'reserved' | 'sold';
  cover_photo: string | null;
};

/** Why the receiver should be careful (codes from the backend's message check). */
export type MessageWarning = 'contact_phone' | 'contact_link' | 'messaging_app' | 'advance_payment';

export type ChatMessage = {
  id: number;
  sender: Person;
  is_mine: boolean;
  kind: 'text' | 'voice';
  /** Empty for a voice message. */
  text: string;
  /** Web address of the recording (voice messages only). */
  audio: string | null;
  duration_ms: number | null;
  sent_at: string;
  read: boolean;
  /** Only filled for messages I received (never for my own). */
  warnings: MessageWarning[];
  /** Received message that may be offensive (harassment / sexual): shown only after a tap. */
  hidden: boolean;
};

/** One row of "my conversations". */
export type ConversationSummary = {
  id: number;
  listing: ConversationListing;
  other_person: Person;
  last_message: {
    text: string;
    /** May be offensive: not shown in the list. */
    hidden: boolean;
    is_voice: boolean;
    duration_ms: number | null;
    sent_at: string;
    is_mine: boolean;
  } | null;
  unread_count: number;
  last_activity: string;
};

export type ConversationsPage = {
  count: number;
  next: string | null;
  results: ConversationSummary[];
};

/** One conversation with its messages (oldest first). */
export type ConversationDetail = {
  id: number;
  listing: ConversationListing;
  buyer: Person;
  seller: Person;
  other_person: Person;
  messages: ChatMessage[];
  /** One of us blocked the other: no new messages can be sent. */
  blocked: { by_me: boolean; by_them: boolean };
  /** Voice messages: daily limit per conversation. */
  voice: { limit: number; left_today: number };
  /** After offensive messages: no messages until a date; no voice after a recent strike. */
  restrictions: { messaging_blocked_until: string | null; voice_blocked: boolean };
  created_at: string;
};

/** My conversation about this listing, if I already have one (its id), else null. */
export async function findConversationForListing(listingId: number): Promise<number | null> {
  const data = await apiFetch<{ results: { id: number }[] }>(
    `/api/conversations/?listing=${listingId}`,
    { auth: true },
  );
  return data.results[0]?.id ?? null;
}

/** Have I already talked to this person (about any listing)? */
export async function hasConversationWith(userId: number): Promise<boolean> {
  const data = await apiFetch<{ results: unknown[] }>(`/api/conversations/?with=${userId}`, {
    auth: true,
  });
  return data.results.length > 0;
}

/**
 * Ask the seller about a listing: sends the first message. If a conversation about
 * this listing already exists, the backend adds the message to it instead.
 */
export function startConversation(listingId: number, text: string, confirmOffensive = false) {
  return apiFetch<{ id: number }>('/api/conversations/', {
    method: 'POST',
    body: { listing: listingId, text, ...(confirmOffensive && { confirm_offensive: true }) },
    auth: true,
  });
}

/** The error code from the backend (e.g. "may_be_offensive"), or undefined. */
export function errorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? (error.data as { code?: string } | null)?.code : undefined;
}

/** My conversations, newest activity first, 20 per page. */
export function fetchConversations(page = 1) {
  return apiFetch<ConversationsPage>(`/api/conversations/?page=${page}`, { auth: true });
}

/**
 * Open a conversation (marks the other person's messages as read).
 * With `after`, only messages newer than that message id are returned.
 */
export function fetchConversation(id: number | string, after?: number) {
  const query = after !== undefined ? `?after=${after}` : '';
  return apiFetch<ConversationDetail>(`/api/conversations/${id}/${query}`, { auth: true });
}

/**
 * Send a text message. If the backend answers "may_be_offensive", ask the user and send
 * again with `confirmOffensive` to send it anyway.
 */
export function sendMessage(conversationId: number | string, text: string, confirmOffensive = false) {
  return apiFetch<ChatMessage>(`/api/conversations/${conversationId}/messages/`, {
    method: 'POST',
    body: { text, ...(confirmOffensive && { confirm_offensive: true }) },
    auth: true,
  });
}

/** Send a recorded voice message (an .m4a file on the phone). */
export async function sendVoiceMessage(conversationId: number | string, fileUri: string) {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(fileUri)).blob();
    form.append('audio', blob, 'voice.m4a');
  } else {
    // Expo's fetch (SDK 58) needs a part that can give its bytes (see uploadListingPhoto).
    const file = new File(fileUri);
    const part = { name: 'voice.m4a', type: 'audio/mp4', bytes: () => file.bytes() };
    form.append('audio', part as unknown as Blob);
  }
  return apiFetch<ChatMessage>(`/api/conversations/${conversationId}/voice/`, {
    method: 'POST',
    form,
    auth: true,
    timeoutMs: 60000,
  });
}

/** Total unread messages, for the red badge on the Messages tab. */
export async function fetchUnreadCount() {
  return (await apiFetch<{ unread: number }>('/api/conversations/unread-count/', { auth: true }))
    .unread;
}
