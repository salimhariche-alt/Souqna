import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  REPORT_REASONS,
  sendReport,
  type ReportReason,
  type ReportTarget,
} from '@/api/safety';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formErrorsFrom } from '@/i18n/api-errors';
import { useLanguage } from '@/i18n/language-provider';

const MAX_TEXT = 500;

type Props = {
  /** What is being reported; null = the sheet is closed. */
  target: { type: ReportTarget; id: number } | null;
  onClose: () => void;
};

type Step = 'form' | 'thanks' | 'already';

/** Report a listing / user / message: pick a reason, optional details, then "Thank you". */
export function ReportSheet({ target, onClose }: Props) {
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const theme = useTheme();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [text, setText] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  const align = { textAlign: direction === 'rtl' ? 'right' : 'left', writingDirection: direction } as const;

  const reset = () => {
    setReason(null);
    setText('');
    setStep('form');
    setError(undefined);
  };

  const send = async () => {
    if (!target) return;
    if (!reason) return setError(t('report.chooseReason'));
    setSending(true);
    setError(undefined);
    try {
      const result = await sendReport(target.type, target.id, reason, text.trim());
      setStep(result === 'already' ? 'already' : 'thanks');
    } catch (e) {
      setError(formErrorsFrom(e, t).general ?? t('errors.unknown'));
    } finally {
      setSending(false);
    }
  };

  const title =
    target?.type === 'user'
      ? t('report.userTitle')
      : target?.type === 'message'
        ? t('report.messageTitle')
        : t('report.listingTitle');

  return (
    <Modal
      visible={target !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onShow={reset}>
      <KeyboardAvoidingView
        style={[styles.backdrop, { direction }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.flex} onPress={onClose} accessibilityLabel={t('listing.cancel')} />
        <ThemedView style={styles.sheet}>
          <SafeAreaView edges={['bottom']}>
            {step === 'form' ? (
              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <ThemedText type="smallBold" style={[styles.title, align]}>
                  {title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={align}>
                  {t('report.intro')}
                </ThemedText>

                <View accessibilityRole="radiogroup">
                  {REPORT_REASONS.map((value) => {
                    const selected = reason === value;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => {
                          setReason(value);
                          setError(undefined);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        style={({ pressed }) => [
                          styles.reason,
                          { borderColor: selected ? Brand.fill : theme.backgroundSelected },
                          selected && styles.reasonSelected,
                          pressed && styles.pressed,
                        ]}>
                        <Ionicons
                          name={selected ? 'radio-button-on' : 'radio-button-off'}
                          size={22}
                          color={selected ? Brand.fill : theme.textSecondary}
                        />
                        <ThemedText style={[styles.flex, align]}>
                          {t(`report.reasons.${value}`)}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                <ThemedText type="small" themeColor="textSecondary" style={align}>
                  {t('report.detailsLabel')}
                </ThemedText>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  multiline
                  maxLength={MAX_TEXT}
                  placeholder={t('report.detailsPlaceholder')}
                  placeholderTextColor={theme.textSecondary}
                  accessibilityLabel={t('report.detailsLabel')}
                  style={[
                    styles.input,
                    { backgroundColor: theme.backgroundElement, color: theme.text },
                    align,
                  ]}
                />

                {error ? (
                  <ThemedText themeColor="danger" type="small" style={[styles.error, align]}>
                    {error}
                  </ThemedText>
                ) : null}
                <PrimaryButton title={t('report.send')} onPress={send} loading={sending} />
                <Pressable
                  onPress={onClose}
                  disabled={sending}
                  accessibilityRole="button"
                  style={styles.cancel}>
                  <ThemedText type="smallBold" themeColor="primary" style={styles.cancelText}>
                    {t('listing.cancel')}
                  </ThemedText>
                </Pressable>
              </ScrollView>
            ) : (
              <View style={[styles.content, styles.thanks]} accessibilityLiveRegion="polite">
                <Ionicons name="shield-checkmark" size={48} color="#1E8E3E" />
                <ThemedText type="smallBold" style={[styles.title, styles.center]}>
                  {t('report.thanksTitle')}
                </ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.center}>
                  {step === 'already' ? t('report.alreadyText') : t('report.thanksText')}
                </ThemedText>
                <PrimaryButton title={t('report.close')} onPress={onClose} />
              </View>
            )}
          </SafeAreaView>
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    maxHeight: '90%',
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  thanks: { alignItems: 'center' },
  title: { fontSize: 18 },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
  },
  reasonSelected: { backgroundColor: 'rgba(180,71,42,0.08)' },
  pressed: { opacity: 0.6 },
  input: {
    minHeight: 80,
    maxHeight: 160,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  error: {},
  cancel: { alignItems: 'center', paddingVertical: Spacing.two },
  cancelText: {},
});
