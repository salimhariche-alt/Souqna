import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useLanguage } from '@/i18n/language-provider';
import { useTokens } from '@/theme';

import { AppText } from './text';

type Props = {
  label: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  /** e.g. "Français" next to "Langue" */
  value?: string;
  /** A second, smaller line under the label. */
  description?: string;
  onPress?: () => void;
  /** The ">" at the end. Shown by default when the row can be tapped. */
  arrow?: boolean;
  danger?: boolean;
};

/** A row: icon, label, optional value and an arrow (">" in French, "<" in Arabic). */
export function ListRow({ label, icon, value, description, onPress, arrow, danger = false }: Props) {
  const tk = useTokens();
  const { direction } = useLanguage();
  const showArrow = arrow ?? Boolean(onPress);
  const color = danger ? tk.color.danger : tk.color.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: 56,
          paddingHorizontal: tk.space.lg,
          paddingVertical: tk.space.md,
          backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface,
          borderRadius: tk.radius.lg,
          gap: tk.space.md,
        },
      ]}>
      {icon ? (
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: danger ? tk.color.dangerSoft : tk.color.primarySoft },
          ]}>
          <Ionicons name={icon} size={20} color={danger ? tk.color.danger : tk.color.primary} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <AppText variant="bodyStrong" style={{ color }} numberOfLines={1}>
          {label}
        </AppText>
        {description ? (
          <AppText variant="small" tone="secondary" numberOfLines={2}>
            {description}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="small" tone="secondary" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {showArrow ? (
        <Ionicons
          name={direction === 'rtl' ? 'chevron-back' : 'chevron-forward'}
          size={18}
          color={tk.color.textMuted}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  value: { maxWidth: '40%' },
});
