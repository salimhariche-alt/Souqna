import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  meRequest,
  phoneStatusRequest,
  sendPhoneCodeRequest,
  verifyPhoneCodeRequest,
  type PhoneStatus,
  type VerificationErrorData,
} from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/auth-provider';
import { leaveAuthScreen, normalizePhone, safeNext } from '@/auth/navigation';
import { AuthFormLayout, FormMessage } from '@/components/auth-form-layout';
import { CodeInput } from '@/components/code-input';
import { FeedMessage } from '@/components/feed-message';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { RequireAuth } from '@/components/require-auth';
import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useCountdown } from '@/hooks/use-countdown';
import { useTheme } from '@/hooks/use-theme';
import { maskPhone } from '@/utils/phone';

/** "waiting" = beta mode: no SMS, an admin verifies the account by hand. */
type Step = 'loading' | 'phone' | 'code' | 'waiting' | 'error';

/** 905 -> "15:05" */
function minutesSeconds(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function VerifyPhoneContent({ next }: { next: string | undefined }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { user, updateUser } = useAuth();
  const [step, setStep] = useState<Step>('loading');
  const [phone, setPhone] = useState<string | null>(null); // where the code was sent
  const [phoneInput, setPhoneInput] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const resend = useCountdown(0);
  const lock = useCountdown(0);
  const startResend = resend.start; // stable functions, safe to use in callbacks
  const startLock = lock.start;
  const started = useRef(false);

  const accountHasPhone = !!user?.phone;

  /** Turn a backend refusal into a friendly message (and start countdowns). */
  const explain = useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError && error.isNetworkError) return t('errors.network');
      const data = (error instanceof ApiError ? error.data : null) as VerificationErrorData | null;
      switch (data?.code) {
        case 'wrong_code':
          return t('verify.errors.wrongCode', { count: data.attempts_left ?? 0 });
        case 'locked':
          startLock(data.retry_in ?? 900);
          return t('verify.errors.locked');
        case 'code_expired':
          return t('verify.errors.codeExpired');
        case 'no_code':
          return t('verify.errors.noCode');
        case 'invalid_code':
          return t('verify.errors.invalidCode');
        case 'resend_too_soon':
          startResend(data.retry_in ?? 60);
          return t('verify.errors.resendTooSoon');
        case 'phone_required':
          return t('verify.errors.phoneRequired');
        case 'phone_invalid':
          return t('errors.phoneInvalid');
        case 'phone_taken':
          return t('errors.phoneTaken');
        case 'phone_blocked':
          return t('errors.phoneBlocked');
        case 'beta_manual_verification':
          setStep('waiting');
          return t('beta.waitingShort');
        default:
          return data?.detail ?? t('errors.unknown');
      }
    },
    [t, startLock, startResend],
  );

  const applyStatus = useCallback(
    (status: PhoneStatus) => {
      setPhone(status.phone);
      startResend(status.resend_in);
      startLock(status.locked_for);
    },
    [startResend, startLock],
  );

  const sendCode = useCallback(
    async (newPhone?: string) => {
      setBusy(true);
      setMessage(undefined);
      try {
        const status = await sendPhoneCodeRequest(newPhone);
        applyStatus(status);
        setCode('');
        setStep('code');
      } catch (error) {
        const text = explain(error);
        const data = (error instanceof ApiError ? error.data : null) as VerificationErrorData | null;
        // "Wait before resending" or "locked": a code may still be on its way, stay on the code step.
        if (data?.code === 'resend_too_soon' || data?.code === 'locked') setStep('code');
        setMessage(text);
      } finally {
        setBusy(false);
      }
    },
    [applyStatus, explain],
  );

  // Find out where we are, and send a code if needed (on opening, and on "Try again").
  const begin = useCallback(() => {
    setStep('loading');
    phoneStatusRequest()
      .then((status) => {
        applyStatus(status);
        if (status.phone_verified) leaveAuthScreen(next);
        else if (status.beta_mode) setStep('waiting');
        else if (status.locked_for > 0 || status.code_expires_in > 0) setStep('code');
        else if (!status.phone) setStep('phone');
        else sendCode();
      })
      .catch(() => setStep('error'));
  }, [applyStatus, sendCode, next]);

  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    if (user.phone_verified) leaveAuthScreen(next);
    else begin();
  }, [user, next, begin]);

  const submitCode = async (value: string) => {
    if (busy || lock.left > 0) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const { user: verified } = await verifyPhoneCodeRequest(value);
      await updateUser(verified);
      leaveAuthScreen(next);
    } catch (error) {
      setCode('');
      setMessage(explain(error));
    } finally {
      setBusy(false);
    }
  };

  const later = () => (router.canGoBack() ? router.back() : router.replace('/'));

  /** Beta mode: has an admin verified me yet? */
  const checkAgain = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const fresh = await meRequest();
      await updateUser(fresh);
      if (fresh.phone_verified) leaveAuthScreen(next);
      else setMessage(t('beta.stillWaiting'));
    } catch (error) {
      setMessage(explain(error));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'waiting') {
    return (
      <AuthFormLayout>
        <View style={styles.header}>
          <View style={styles.icon}>
            <Ionicons name="hourglass-outline" size={34} color={Brand.fill} />
          </View>
          <ThemedText type="subtitle" style={styles.center}>
            {t('beta.waitingTitle')}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {t('beta.waitingText')}
          </ThemedText>
        </View>
        {message ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {message}
          </ThemedText>
        ) : null}
        <PrimaryButton title={t('beta.checkAgain')} loading={busy} onPress={checkAgain} />
        <Pressable onPress={later} accessibilityRole="button" style={styles.linkButton}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('verify.later')}
          </ThemedText>
        </Pressable>
      </AuthFormLayout>
    );
  }

  if (step === 'loading') {
    return <FeedMessage kind="loading" text={t('verify.preparing')} />;
  }
  if (step === 'error') {
    return (
      <FeedMessage
        kind="message"
        icon="cloud-offline-outline"
        text={t('home.error')}
        buttonLabel={t('home.retry')}
        onPress={begin}
      />
    );
  }

  return (
    <AuthFormLayout>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons name="shield-checkmark-outline" size={34} color={Brand.fill} />
        </View>
        <ThemedText type="subtitle" style={styles.center}>
          {t('verify.title')}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {step === 'phone' ? t('verify.addPhoneIntro') : t('verify.sentTo', { phone: maskPhone(phone) })}
        </ThemedText>
      </View>

      {step === 'phone' ? (
        <>
          <FormMessage message={message} />
          <FormField
            label={t('verify.phoneLabel')}
            placeholder="06 12 34 56 78"
            value={phoneInput}
            onChangeText={setPhoneInput}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
          />
          <PrimaryButton
            title={t('verify.sendCode')}
            loading={busy}
            onPress={() => sendCode(normalizePhone(phoneInput))}
          />
        </>
      ) : (
        <>
          <CodeInput
            value={code}
            onChange={(value) => {
              setCode(value);
              if (message && lock.left === 0) setMessage(undefined);
            }}
            onComplete={submitCode}
            disabled={busy || lock.left > 0}
            error={!!message && lock.left === 0}
            accessibilityLabel={t('verify.codeLabel')}
          />

          {lock.left > 0 ? (
            <FormMessage
              message={`${t('verify.errors.locked')} ${t('verify.tryAgainIn', {
                time: minutesSeconds(lock.left),
              })}`}
            />
          ) : message ? (
            <ThemedText themeColor="danger" type="small" style={[styles.error, styles.center]}>
              {message}
            </ThemedText>
          ) : busy ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {t('verify.checking')}
            </ThemedText>
          ) : null}

          <Pressable
            onPress={() => sendCode(accountHasPhone ? undefined : phone ?? undefined)}
            disabled={busy || resend.left > 0 || lock.left > 0}
            accessibilityRole="button"
            style={styles.linkButton}>
            <ThemedText
              type="smallBold"
              themeColor={resend.left > 0 || lock.left > 0 ? 'textSecondary' : 'primary'}>
              {resend.left > 0
                ? t('verify.resendIn', { seconds: resend.left })
                : t('verify.resend')}
            </ThemedText>
          </Pressable>

          {!accountHasPhone && (
            <Pressable
              onPress={() => {
                setMessage(undefined);
                setStep('phone');
              }}
              accessibilityRole="button"
              style={styles.linkButton}>
              <ThemedText type="smallBold" themeColor="primary" style={styles.link}>
                {t('verify.changeNumber')}
              </ThemedText>
            </Pressable>
          )}

          {__DEV__ && (
            <ThemedText type="small" themeColor="textSecondary" style={[styles.center, styles.devHint]}>
              {t('verify.devHint')}
            </ThemedText>
          )}
        </>
      )}

      <Pressable onPress={later} accessibilityRole="button" style={styles.linkButton}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('verify.later')}
        </ThemedText>
      </Pressable>
    </AuthFormLayout>
  );
}

/** "Enter the code we sent to 06xx xx xx 89" - confirm the phone number by SMS. */
export default function VerifyPhoneScreen() {
  const next = safeNext(useLocalSearchParams<{ next?: string }>().next);
  return (
    <RequireAuth next={next ?? '/profile'}>
      <VerifyPhoneContent next={next} />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(32,138,239,0.12)',
  },
  center: { textAlign: 'center' },
  error: {},
  link: {},
  linkButton: { alignItems: 'center', paddingVertical: Spacing.two },
  devHint: { marginTop: Spacing.two },
});
