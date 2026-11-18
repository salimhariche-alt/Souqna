import type { PropsWithChildren } from 'react';
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native';

import { useTokens } from '@/theme';

type Props = PropsWithChildren<{
  /** Inner space (default true). */
  padded?: boolean;
  /** A thin border instead of a filled background. */
  outlined?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * A rounded box that groups related things (a seller, a set of details...): cream,
 * a thin warm border, corners 20, no heavy shadow. `outlined` = sand inside instead.
 */
export function Card({ children, padded = true, outlined = false, onPress, accessibilityLabel, style }: Props) {
  const tk = useTokens();
  const base: ViewStyle = {
    borderRadius: tk.radius.xl,
    padding: padded ? tk.space.lg : 0,
    gap: tk.space.md,
    backgroundColor: outlined ? tk.color.background : tk.color.surface,
    borderWidth: 1,
    borderColor: tk.color.border,
    overflow: 'hidden',
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [base, pressed && { backgroundColor: tk.color.surfaceAlt }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
