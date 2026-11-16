import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTokens } from '@/theme';

import { AppText } from './text';

type Props = {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  selected?: boolean;
  onPress?: () => void;
  /** Width of the tile (the height follows). */
  size?: number;
};

/** A square tile with an icon and a name, for browsing categories. */
export function CategoryTile({ label, icon, selected = false, onPress, size = 92 }: Props) {
  const tk = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tile,
        {
          width: size,
          paddingVertical: tk.space.md,
          paddingHorizontal: tk.space.xs,
          borderRadius: tk.radius.lg,
          gap: tk.space.sm,
          backgroundColor: selected ? tk.color.primarySoft : pressed ? tk.color.surfaceAlt : tk.color.surface,
          borderColor: selected ? tk.color.primary : 'transparent',
        },
      ]}>
      <View style={[styles.circle, { backgroundColor: selected ? tk.color.primary : tk.color.background }]}>
        <Ionicons name={icon} size={24} color={selected ? tk.color.onPrimary : tk.color.primary} />
      </View>
      <AppText variant="caption" align="center" numberOfLines={2} tone={selected ? 'primary' : 'default'}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', borderWidth: 1.5 },
  circle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
