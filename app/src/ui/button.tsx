import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useTokens } from '@/theme';

import { AppText } from './text';

type Props = {
  title: string;
  onPress: () => void;
  /**
   * filled = the main action (terracotta, "Créer un compte");
   * outlined = a second choice (cream with a border, "J'ai déjà un compte");
   * ghost = a quiet text button.
   */
  variant?: 'filled' | 'outlined' | 'ghost';
  /** danger = delete, log out... */
  tone?: 'brand' | 'danger';
  icon?: ComponentProps<typeof Ionicons>['name'];
  /** md = 54 high (main buttons); sm = 44 high. */
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  /** Takes the whole width (default) or only what it needs. */
  fullWidth?: boolean;
  accessibilityLabel?: string;
};

/** The app's button (corners 16). Shows a spinner and ignores taps while loading. */
export function Button({
  title,
  onPress,
  variant = 'filled',
  tone = 'brand',
  icon,
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = true,
  accessibilityLabel,
}: Props) {
  const tk = useTokens();
  const danger = tone === 'danger';
  const fill = danger ? tk.color.danger : tk.color.primary;
  const pressedFill = danger ? tk.color.danger : tk.color.primaryPressed;
  const onFill = danger ? (tk.scheme === 'dark' ? tk.color.background : '#FFFFFF') : tk.color.onPrimary;
  // Outlined and ghost buttons: dark text (danger ones in the danger colour).
  const content =
    variant === 'filled' ? onFill : danger ? tk.color.danger : variant === 'ghost' ? tk.color.primary : tk.color.text;
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: size === 'sm' ? 44 : tk.buttonHeight,
          paddingHorizontal: size === 'sm' ? tk.space.lg : tk.space.xl,
          borderRadius: tk.radius.lg,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        variant === 'filled' && { backgroundColor: pressed ? pressedFill : fill },
        variant === 'outlined' && {
          borderWidth: 1,
          borderColor: tk.color.borderStrong,
          backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface,
        },
        variant === 'ghost' && { backgroundColor: pressed ? tk.color.surfaceAlt : 'transparent' },
        disabled && styles.disabled,
        pressed && variant === 'filled' && danger && styles.pressedDanger,
      ]}>
      {loading ? (
        <ActivityIndicator color={content} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 18 : 20} color={content} /> : null}
          <AppText
            variant={size === 'sm' ? 'smallStrong' : 'bodyStrong'}
            align="center"
            // Two lines at most: long labels (French, Arabic) wrap instead of being cut off.
            style={[styles.label, { color: content }]}
            numberOfLines={2}>
            {title}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, maxWidth: '100%' },
  label: { flexShrink: 1 },
  disabled: { opacity: 0.45 },
  pressedDanger: { opacity: 0.85 },
});
