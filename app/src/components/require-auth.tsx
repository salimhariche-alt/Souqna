import { Redirect, type Href } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';

type Props = PropsWithChildren<{
  next: string;
  /** Also require a verified phone number (e.g. to post a listing). */
  verified?: boolean;
}>;

/**
 * Shows its content only to logged-in users. Anyone else is sent to the
 * Log in screen, and comes back to `next` afterwards. With `verified`, users
 * who haven't confirmed their phone yet are sent to the verification screen.
 *
 * (Tapping a protected tab already opens Log in first - see (tabs)/_layout.tsx.
 * This also covers other ways of arriving, like a web link or an expired session.)
 */
export function RequireAuth({ next, verified = false, children }: Props) {
  const { status, user } = useAuth();

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
  if (verified && user && !user.phone_verified) {
    return <Redirect href={{ pathname: '/verify-phone', params: { next } } as Href} />;
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
