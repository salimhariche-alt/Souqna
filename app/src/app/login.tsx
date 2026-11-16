import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { leaveAuthScreen, safeNext } from '@/auth/navigation';
import { AuthFormLayout, FormMessage } from '@/components/auth-form-layout';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formErrorsFrom, type FormErrors } from '@/i18n/api-errors';

/** Log in with a phone number or email, plus password. */
export default function LoginScreen() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const next = safeNext(useLocalSearchParams<{ next?: string }>().next);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({ fields: {} });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    // Quick checks before asking the server.
    const fields: Record<string, string> = {};
    if (!identifier.trim()) fields.identifier = t('errors.identifierRequired');
    if (!password) fields.password = t('errors.passwordRequired');
    setErrors({ fields });
    if (Object.keys(fields).length) return;

    setLoading(true);
    try {
      await login(identifier.trim(), password);
      leaveAuthScreen(next);
    } catch (error) {
      setErrors(
        formErrorsFrom(error, t, { phone_or_email: 'identifier', password: 'password' }),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFormLayout intro={next ? t('auth.loginRequired') : undefined}>
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
        returnKeyType="next"
      />
      <FormField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        error={errors.fields.password}
        password
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <PrimaryButton title={t('auth.loginButton')} onPress={submit} loading={loading} />

      <View style={styles.switchRow}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('auth.noAccount')}
        </ThemedText>
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            router.replace({ pathname: '/signup', params: next ? { next } : {} } as Href)
          }>
          <ThemedText type="smallBold" themeColor="primary" style={styles.link}>
            {t('auth.goToSignup')}
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
