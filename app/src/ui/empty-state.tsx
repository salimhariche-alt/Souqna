import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTokens } from '@/theme';

import { Button } from './button';
import { AppText } from './text';

type Props = {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  text?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** "Nothing here yet": a big friendly icon, a title, a sentence and an optional button. */
export function EmptyState({ icon, title, text, actionLabel, onAction }: Props) {
  const tk = useTokens();
  return (
    <View style={[styles.container, { padding: tk.space.xl, gap: tk.space.md }]}>
      <View style={[styles.circle, { backgroundColor: tk.color.primarySoft }]}>
        <Ionicons name={icon} size={40} color={tk.color.primary} />
      </View>
      <AppText variant="subtitle" align="center">
        {title}
      </AppText>
      {text ? (
        <AppText variant="body" tone="secondary" align="center">
          {text}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button title={actionLabel} onPress={onAction} fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  circle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  action: { marginTop: 8 },
});
