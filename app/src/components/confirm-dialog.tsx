import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useLanguage } from '@/i18n/language-provider';

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
 * "Are you sure?" with two buttons. Our own dialog (instead of the phone's Alert)
 * so it also works on the web and follows the right-to-left layout.
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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.backdrop, { direction }]}>
        <ThemedView style={styles.card} accessibilityRole="alert">
          <ThemedText type="smallBold" style={styles.title}>
            {title}
          </ThemedText>
          <ThemedText themeColor="textSecondary">{message}</ThemedText>
          <PrimaryButton
            title={confirmLabel}
            onPress={onConfirm}
            loading={loading}
            variant={danger ? 'danger' : 'primary'}
          />
          <Pressable
            onPress={onCancel}
            disabled={loading}
            accessibilityRole="button"
            style={styles.cancel}>
            <ThemedText type="smallBold" style={styles.cancelText}>
              {cancelLabel}
            </ThemedText>
          </Pressable>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: { fontSize: 18 },
  cancel: { alignItems: 'center', paddingVertical: Spacing.two },
  cancelText: { color: '#208AEF' },
});
