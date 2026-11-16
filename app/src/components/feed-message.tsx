import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props =
  | { kind: 'loading'; text: string }
  | {
      kind: 'message';
      icon: ComponentProps<typeof Ionicons>['name'];
      text: string;
      buttonLabel?: string;
      onPress?: () => void;
    };

/** A centred spinner, or an icon with a short message (and an optional button). */
export function FeedMessage(props: Props) {
  const theme = useTheme();
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      {props.kind === 'loading' ? (
        <ActivityIndicator size="large" />
      ) : (
        <Ionicons name={props.icon} size={44} color={theme.textSecondary} />
      )}
      <ThemedText themeColor="textSecondary" style={styles.text}>
        {props.text}
      </ThemedText>
      {props.kind === 'message' && props.buttonLabel && props.onPress ? (
        <Pressable onPress={props.onPress} accessibilityRole="button" style={styles.button}>
          <ThemedText type="smallBold" style={styles.buttonText}>
            {props.buttonLabel}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
    minHeight: 280,
  },
  text: { textAlign: 'center' },
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    backgroundColor: Brand.fill,
  },
  buttonText: { color: '#ffffff' },
});
