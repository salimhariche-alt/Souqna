import { Redirect, type Href } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';

/**
 * Shows its content only to logged-in users. Anyone else is sent to the
 * Log in screen, and comes back to `next` afterwards.
 *
 * (Tapping a protected tab already opens Log in first - see (tabs)/_layout.tsx.
 * This also covers other ways of arriving, like a web link or an expired session.)
 */
export function RequireAuth({ next, children }: PropsWithChildren<{ next: string }>) {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (status === 'signedOut') {
    return <Redirect href={{ pathname: '/login', params: { next } } as Href} />;
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
