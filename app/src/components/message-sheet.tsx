import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language-provider';

export const MAX_MESSAGE_LENGTH = 1000;

type Props = {
  visible: boolean;
  sellerName: string;
  sending: boolean;
  error?: string;
  /** Replaces "Send", e.g. "Send anyway" after a warning. */
  sendLabel?: string;
  /** Called when the user changes the text. */
  onTextChange?: () => void;
  onSend: (text: string) => void;
  onCancel: () => void;
};

/** Slides up from the bottom: a pre-filled first message to the seller, editable. */
export function MessageSheet({
  visible,
  sellerName,
  sending,
  error,
  sendLabel,
  onTextChange,
  onSend,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const theme = useTheme();
  const [text, setText] = useState('');
  const [localError, setLocalError] = useState<string>();

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return setLocalError(t('errors.messageEmpty'));
    if (trimmed.length > MAX_MESSAGE_LENGTH) return setLocalError(t('errors.messageTooLong'));
    setLocalError(undefined);
    onSend(trimmed);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      onShow={() => {
        setText(t('message.defaultText'));
        setLocalError(undefined);
      }}>
      <KeyboardAvoidingView
        style={[styles.backdrop, { direction }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.flex} onPress={onCancel} accessibilityLabel={t('listing.cancel')} />
        <ThemedView style={styles.sheet}>
          <SafeAreaView edges={['bottom']} style={styles.content}>
            <ThemedText type="smallBold" style={styles.title}>
              {t('message.sheetTitle', { name: sellerName })}
            </ThemedText>
            <TextInput
              value={text}
              onChangeText={(value) => {
                setText(value);
                onTextChange?.();
              }}
              multiline
              maxLength={MAX_MESSAGE_LENGTH + 50}
              placeholder={t('message.placeholder')}
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel={t('message.placeholder')}
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundElement,
                  color: theme.text,
                  textAlign: direction === 'rtl' ? 'right' : 'left',
                  writingDirection: direction,
                },
              ]}
            />
            {localError || error ? (
              <ThemedText type="small" style={styles.error}>
                {localError ?? error}
              </ThemedText>
            ) : null}
            <PrimaryButton
              title={sendLabel ?? t('message.send')}
              onPress={send}
              loading={sending}
              variant={sendLabel ? 'danger' : 'primary'}
            />
            <Pressable
              onPress={onCancel}
              disabled={sending}
              accessibilityRole="button"
              style={styles.cancel}>
              <ThemedText type="smallBold" style={styles.cancelText}>
                {t('listing.cancel')}
              </ThemedText>
            </Pressable>
          </SafeAreaView>
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: Spacing.four, borderTopRightRadius: Spacing.four },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  title: { fontSize: 18 },
  input: {
    minHeight: 110,
    maxHeight: 220,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  error: { color: '#D93025' },
  cancel: { alignItems: 'center', paddingVertical: Spacing.two },
  cancelText: { color: '#208AEF' },
});
