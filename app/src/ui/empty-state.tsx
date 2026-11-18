import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { type TintKey, useTokens } from '@/theme';

import { ArchFrame } from './arch';
import { Button } from './button';
import { AppText } from './text';

type Props = {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  text?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** The soft colour of the arch behind the icon (default: clay). */
  tint?: TintKey;
};

/** "Nothing here yet": a big icon in a soft arch, a title, a sentence and an optional button. */
export function EmptyState({ icon, title, text, actionLabel, onAction, tint = 'tint1' }: Props) {
  const tk = useTokens();
  return (
    <View style={[styles.container, { padding: tk.space.xl, gap: tk.space.md }]}>
      <ArchFrame width={88} height={104} color={tk.color[tint]} bottomRadius={tk.radius.md}>
        <View style={styles.center}>
          <Ionicons name={icon} size={40} color={tk.color.tintIcon} />
        </View>
      </ArchFrame>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
  action: { marginTop: 8 },
});
