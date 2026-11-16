import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTokens, type Colors } from '@/theme';

import { AppText } from './text';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

type Props = {
  label: string;
  tone?: BadgeTone;
  icon?: ComponentProps<typeof Ionicons>['name'];
  /** Strong colour (e.g. "Vendu" on a photo) instead of the soft one. */
  solid?: boolean;
};

const COLORS: Record<BadgeTone, [keyof Colors, keyof Colors]> = {
  //          strong colour   soft background
  neutral: ['textSecondary', 'surfaceAlt'],
  brand: ['primary', 'primarySoft'],
  success: ['success', 'successSoft'],
  warning: ['warning', 'warningSoft'],
  danger: ['danger', 'dangerSoft'],
  info: ['info', 'infoSoft'],
};

/** A small pill: "Téléphone vérifié", "Vendu", "En vérification"... */
export function Badge({ label, tone = 'neutral', icon, solid = false }: Props) {
  const tk = useTokens();
  const [strong, soft] = COLORS[tone];
  const background = solid ? tk.color[strong] : tk.color[soft];
  const foreground = solid ? (tone === 'brand' ? tk.color.onPrimary : tk.scheme === 'dark' ? '#141311' : '#FFFFFF') : tk.color[strong];
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: background, borderRadius: tk.radius.full, paddingHorizontal: tk.space.md },
      ]}>
      {icon ? <Ionicons name={icon} size={14} color={foreground} /> : null}
      <AppText variant="caption" style={{ color: foreground }} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingVertical: 3 },
});
