import { Pressable, StyleSheet, View } from 'react-native';

import { useTokens } from '@/theme';

import { AppText } from './text';

type Props = { title: string; actionLabel?: string; onAction?: () => void };

/** A section title, with an optional link at the end ("Voir tout"). */
export function SectionHeader({ title, actionLabel, onAction }: Props) {
  const tk = useTokens();
  return (
    <View style={[styles.row, { paddingVertical: tk.space.sm }]} accessibilityRole="header">
      <AppText variant="subtitle" style={styles.flex} numberOfLines={1}>
        {title}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={10}>
          <AppText variant="smallStrong" tone="primary">
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
});
