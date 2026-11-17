import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { sendFeedbackRequest } from '@/api/feedback';
import { RequireAuth } from '@/components/require-auth';
import { formErrorsFrom } from '@/i18n/api-errors';
import { useLanguage } from '@/i18n/language-provider';
import { preparePhoto } from '@/photos/prepare';
import { usePhotoPicker } from '@/photos/use-photo-picker';
import { useTokens } from '@/theme';
import { AppText, Button, TextField } from '@/ui';

const MAX_LENGTH = 2000;
/** Screenshots are read on a computer: 1600 px is plenty (the server keeps at most that). */
const SCREENSHOT_WIDTH = 1600;

/** "Send feedback" (Profile tab): a message and an optional screenshot for the Sougna team. */
function FeedbackContent() {
  const { t } = useTranslation();
  const tk = useTokens();
  const { language } = useLanguage();
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [general, setGeneral] = useState<string>();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const { pick, dialogs } = usePhotoPicker(async ([photo]) => {
    if (!photo) return;
    try {
      const ready = await preparePhoto(photo, SCREENSHOT_WIDTH);
      setScreenshot(ready.uri);
    } catch {
      setGeneral(t('errors.unknown'));
    }
  });

  const send = async () => {
    setGeneral(undefined);
    if (!message.trim()) {
      setError(t('feedback.messageRequired'));
      return;
    }
    setSending(true);
    try {
      await sendFeedbackRequest(message.trim(), language, screenshot);
      setSent(true);
    } catch (failure) {
      const result = formErrorsFrom(failure, t, { message: 'message' });
      setError(result.fields.message);
      setGeneral(result.general ?? (result.fields.message ? undefined : t('errors.unknown')));
    } finally {
      setSending(false);
    }
  };

  const container = [styles.container, { padding: tk.space.lg, gap: tk.space.lg }];

  if (sent) {
    return (
      <View style={[...container, styles.centerAll]}>
        <Ionicons name="checkmark-circle" size={56} color={tk.color.success} />
        <AppText variant="title" align="center">
          {t('feedback.sentTitle')}
        </AppText>
        <AppText tone="secondary" align="center">
          {t('feedback.sentText')}
        </AppText>
        <Button title={t('feedback.back')} onPress={() => router.back()} fullWidth />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ backgroundColor: tk.color.background }}
        contentContainerStyle={container}
        keyboardShouldPersistTaps="handled">
        <AppText tone="secondary">{t('feedback.intro')}</AppText>

        <TextField
          label={t('feedback.messageLabel')}
          placeholder={t('feedback.messagePlaceholder')}
          value={message}
          onChangeText={(value) => {
            setMessage(value);
            if (error) setError(undefined);
          }}
          error={error}
          multiline
          maxLength={MAX_LENGTH}
          hint={`${message.length}/${MAX_LENGTH}`}
        />

        <View style={{ gap: tk.space.sm }}>
          {screenshot ? (
            <View style={[styles.row, { gap: tk.space.md }]}>
              <Image
                source={{ uri: screenshot }}
                style={[styles.thumb, { borderRadius: tk.radius.md, borderColor: tk.color.border }]}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
              <Button
                title={t('feedback.removeScreenshot')}
                icon="trash-outline"
                variant="ghost"
                tone="danger"
                size="sm"
                onPress={() => setScreenshot(null)}
              />
            </View>
          ) : (
            <Button
              title={t('feedback.addScreenshot')}
              icon="image-outline"
              variant="outlined"
              onPress={() => pick('gallery', 1)}
            />
          )}
          <AppText variant="small" tone="muted">
            {t('feedback.screenshotHint')}
          </AppText>
        </View>

        {general ? (
          <AppText variant="small" tone="danger">
            {general}
          </AppText>
        ) : null}
        <Button title={t('feedback.send')} icon="send" onPress={send} loading={sending} fullWidth />
      </ScrollView>
      {dialogs}
    </KeyboardAvoidingView>
  );
}

export default function FeedbackScreen() {
  return (
    <RequireAuth next="/feedback">
      <FeedbackContent />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  centerAll: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  thumb: { width: 72, height: 128, borderWidth: StyleSheet.hairlineWidth },
});
