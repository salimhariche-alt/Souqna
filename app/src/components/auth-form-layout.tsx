import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/** Page layout for the Log in / Sign up forms: scrolls, and moves up with the keyboard. */
export function AuthFormLayout({ intro, children }: PropsWithChildren<{ intro?: string }>) {
  return (
    <ThemedView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {intro ? <ThemedText themeColor="textSecondary">{intro}</ThemedText> : null}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

/** A red box for errors that don't belong to one field (e.g. "can't reach the server"). */
export function FormMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <ThemedView style={styles.message} accessibilityLiveRegion="polite">
      <ThemedText type="small" style={styles.messageText}>
        {message}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  message: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: '#FDECEA',
  },
  messageText: { color: '#B3261E' },
});
