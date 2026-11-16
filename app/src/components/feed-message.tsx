import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTokens } from '@/theme';
import { AppText, EmptyState } from '@/ui';

type Props =
  | { kind: 'loading'; text: string }
  | {
      kind: 'message';
      icon: ComponentProps<typeof Ionicons>['name'];
      text: string;
      buttonLabel?: string;
      onPress?: () => void;
    };

/** A centred spinner, or the design system's empty state (icon, message, button). */
export function FeedMessage(props: Props) {
  const tk = useTokens();
  return (
    <View style={[styles.container, { backgroundColor: tk.color.background }]} accessibilityLiveRegion="polite">
      {props.kind === 'loading' ? (
        <View style={{ alignItems: 'center', gap: tk.space.lg }}>
          <ActivityIndicator size="large" color={tk.color.primary} />
          <AppText tone="secondary" align="center">
            {props.text}
          </AppText>
        </View>
      ) : (
        <EmptyState
          icon={props.icon}
          title={props.text}
          actionLabel={props.buttonLabel}
          onAction={props.onPress}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 300 },
});
