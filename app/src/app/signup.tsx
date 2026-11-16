import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import {
  ALGERIAN_MOBILE,
  LOOKS_LIKE_EMAIL,
  normalizePhone,
  safeNext,
} from '@/auth/navigation';
import { AuthFormLayout, FormMessage } from '@/components/auth-form-layout';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { WilayaPicker } from '@/components/wilaya-picker';
import { Spacing } from '@/constants/theme';
import { formErrorsFrom, type FormErrors } from '@/i18n/api-errors';
import { useLanguage } from '@/i18n/language-provider';

const MIN_PASSWORD_LENGTH = 8;

/** Create an account: phone or email, password, display name and wilaya. */
export default function SignupScreen() {
  const { t } = useTranslation();
  const { signup } = useAuth();
  const { language } = useLanguage();
  const next = safeNext(useLocalSearchParams<{ next?: string }>().next);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [wilaya, setWilaya] = useState<number | null>(null);
  const [errors, setErrors] = useState<FormErrors>({ fields: {} });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const value = identifier.trim();
    const isEmail = value.includes('@');

    // Quick checks before asking the server (it checks everything again).
    const fields: Record<string, string> = {};
    if (!value) fields.identifier = t('errors.phoneOrEmail');
    else if (isEmail && !LOOKS_LIKE_EMAIL.test(value)) fields.identifier = t('errors.emailInvalid');
    else if (!isEmail && !ALGERIAN_MOBILE.test(normalizePhone(value)))
      fields.identifier = t('errors.phoneInvalid');
    if (password.length < MIN_PASSWORD_LENGTH) fields.password = t('errors.passwordShort');
    if (!displayName.trim()) fields.displayName = t('errors.nameRequired');
    if (!wilaya) fields.wilaya = t('errors.wilayaRequired');
    setErrors({ fields });
    if (Object.keys(fields).length || !wilaya) return;

    setLoading(true);
    try {
      await signup({
        ...(isEmail ? { email: value } : { phone: normalizePhone(value) }),
        password,
        display_name: displayName.trim(),
        wilaya,
        preferred_language: language,
      });
      // Next: confirm the phone number by SMS (replaces this screen, so "back"
      // doesn't return to the sign-up form).
      router.replace({ pathname: '/verify-phone', params: next ? { next } : {} } as Href);
    } catch (error) {
      setErrors(
        formErrorsFrom(error, t, {
          phone: 'identifier',
          email: 'identifier',
          password: 'password',
          display_name: 'displayName',
          wilaya: 'wilaya',
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFormLayout>
      <FormMessage message={errors.general} />
      <FormField
        label={t('auth.identifier')}
        placeholder={t('auth.identifierPlaceholder')}
        value={identifier}
        onChangeText={setIdentifier}
        error={errors.fields.identifier}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
      />
      <FormField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        error={errors.fields.password}
        hint={t('auth.passwordHint')}
        password
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <FormField
        label={t('auth.displayName')}
        placeholder={t('auth.displayNamePlaceholder')}
        value={displayName}
        onChangeText={setDisplayName}
        error={errors.fields.displayName}
        autoComplete="name"
        textContentType="name"
        maxLength={50}
      />
      <WilayaPicker
        label={t('auth.wilaya')}
        value={wilaya}
        onChange={setWilaya}
        error={errors.fields.wilaya}
      />
      <PrimaryButton title={t('auth.signupButton')} onPress={submit} loading={loading} />

      <View style={styles.switchRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('auth.haveAccount')}
        </ThemedText>
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            router.replace({ pathname: '/login', params: next ? { next } : {} } as Href)
          }>
          <ThemedText type="smallBold" themeColor="primary" style={styles.link}>
            {t('auth.goToLogin')}
          </ThemedText>
        </Pressable>
      </View>
    </AuthFormLayout>
  );
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  link: {},
});
