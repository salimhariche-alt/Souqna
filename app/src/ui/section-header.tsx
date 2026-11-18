import { Pressable, StyleSheet, View } from 'react-native';

import { useTokens } from '@/theme';

import { AppText } from './text';

type Props = {
  /** "Près de chez vous" (Fraunces). */
  title: string;
  /** A small second line, e.g. the Arabic "قريب منك". */
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** A section title, an optional small line under it, and an optional link ("Voir tout"). */
export function SectionHeader({ title, subtitle, actionLabel, onAction }: Props) {
  const tk = useTokens();
  return (
    <View style={[styles.row, { paddingVertical: tk.space.sm }]} accessibilityRole="header">
      <View style={styles.flex}>
        <AppText variant="subtitle" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="small" tone="secondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={12} style={styles.action}>
          <AppText variant="smallStrong" tone="primary">
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  flex: { flex: 1 },
  action: { minHeight: 24, justifyContent: 'center' },
});
