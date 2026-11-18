import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { type TintKey, useTokens } from '@/theme';

import { ArchFrame } from './arch';
import { AppText } from './text';

type Props = {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  /** Each category gets its own soft colour (default: clay). */
  tint?: TintKey;
  selected?: boolean;
  onPress?: () => void;
  /** Width of the tile (the arch is a little taller than wide). */
  size?: number;
};

/** A category: the icon in a soft-coloured arch, the name under it. Selected = terracotta. */
export function CategoryTile({ label, icon, tint = 'tint1', selected = false, onPress, size = 92 }: Props) {
  const tk = useTokens();
  const arch = size - tk.space.md * 2;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tile,
        { width: size, paddingVertical: tk.space.sm, gap: tk.space.sm, opacity: pressed ? 0.8 : 1 },
      ]}>
      <ArchFrame
        width={arch}
        height={arch * 1.12}
        color={selected ? tk.color.primary : tk.color[tint]}
        bottomRadius={tk.radius.md}>
        <View style={styles.center}>
          <Ionicons name={icon} size={26} color={selected ? tk.color.onPrimary : tk.color.tintIcon} />
        </View>
      </ArchFrame>
      <AppText variant="caption" align="center" numberOfLines={2} tone={selected ? 'primary' : 'default'}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 6 },
});
