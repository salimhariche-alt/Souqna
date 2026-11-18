import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTokens } from '@/theme';
import { Logo, TriangleBand } from '@/ui';

/**
 * Page layout for Log in / Sign up / phone verification ("Warm & Local"): sand
 * background, the logo and a Kabyle band at the top, then the form. Scrolls, and
 * moves up with the keyboard.
 */
export function AuthFormLayout({
  intro,
  children,
  showLogo = true,
}: PropsWithChildren<{ intro?: string; showLogo?: boolean }>) {
  const tk = useTokens();
  return (
    <View style={[styles.flex, { backgroundColor: tk.color.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {showLogo && (
            <View style={styles.brand}>
              <Logo />
              <TriangleBand style={styles.band} />
            </View>
          )}
          {intro ? <ThemedText themeColor="textSecondary">{intro}</ThemedText> : null}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** A soft red box for errors that don't belong to one field (e.g. "can't reach the server"). */
export function FormMessage({ message }: { message?: string }) {
  const tk = useTokens();
  if (!message) return null;
  return (
    <View style={[styles.message, { backgroundColor: tk.color.dangerSoft }]} accessibilityLiveRegion="polite">
      <ThemedText themeColor="danger" type="small">
        {message}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 34,
    gap: 16,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  brand: { alignItems: 'center', gap: 14, marginBottom: 6 },
  band: { width: '100%' },
  message: { padding: 14, borderRadius: 16 },
});
