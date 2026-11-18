import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTokens } from '@/theme';

import { AppText } from './text';

type Props = {
  label: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  /** Selected chips are terracotta with white text. */
  selected?: boolean;
  /** Without onPress the chip is just a label ("Taille M", "Oran"). */
  onPress?: () => void;
  accessibilityLabel?: string;
};

/** A pill: filters, sizes, condition, wilaya... */
export function Chip({ label, icon, selected = false, onPress, accessibilityLabel }: Props) {
  const tk = useTokens();
  // On the chip colour, text stays dark (terracotta TEXT would be under 4.5:1 there).
  const foreground = selected ? tk.color.onPrimary : tk.color.text;
  const content = (
    <View style={[styles.row, { gap: tk.space.xs }]}>
      {icon ? <Ionicons name={icon} size={15} color={foreground} /> : null}
      <AppText variant="smallStrong" style={{ color: foreground }} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
  const box = {
    minHeight: 36,
    paddingHorizontal: tk.space.md + 2,
    borderRadius: tk.radius.full,
    backgroundColor: selected ? tk.color.primary : tk.color.chip,
  };
  if (!onPress) {
    return (
      <View style={[styles.chip, box]} accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      // The pill is 36 high; the tap area reaches 44+.
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
      style={({ pressed }) => [
        styles.chip,
        box,
        pressed && { backgroundColor: selected ? tk.color.primaryPressed : tk.color.borderStrong },
      ]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
});
