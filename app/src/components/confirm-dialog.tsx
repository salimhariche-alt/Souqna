import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useLanguage } from '@/i18n/language-provider';
import { useTokens } from '@/theme';
import { Button } from '@/ui';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  danger?: boolean;
};

/**
 * "Are you sure?" with two buttons, in the "Warm & Local" style (cream card, corners 24,
 * title in Fraunces). Our own dialog (instead of the phone's Alert) so it also works
 * on the web and follows the right-to-left layout.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  loading = false,
  danger = false,
}: Props) {
  const { direction } = useLanguage();
  const tk = useTokens();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.backdrop, { direction, backgroundColor: tk.color.overlay }]}>
        <View
          style={[styles.card, { backgroundColor: tk.color.surface, borderColor: tk.color.border }]}
          accessibilityRole="alert">
          <ThemedText type="subtitle" style={styles.title}>
            {title}
          </ThemedText>
          <ThemedText themeColor="textSecondary">{message}</ThemedText>
          <Button title={confirmLabel} onPress={onConfirm} loading={loading} tone={danger ? 'danger' : 'brand'} />
          <Pressable onPress={onCancel} disabled={loading} accessibilityRole="button" style={styles.cancel}>
            <ThemedText type="smallBold" themeColor="primary">
              {cancelLabel}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 400, borderRadius: 24, borderWidth: 1, padding: 22, gap: 14 },
  title: { fontSize: 20, lineHeight: 26 },
  cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
});
