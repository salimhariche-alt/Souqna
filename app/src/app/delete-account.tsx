import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { deleteAccountRequest } from '@/api/auth';
import { errorCode } from '@/api/conversations';
import { useAuth } from '@/auth/auth-provider';
import { FormField } from '@/components/form-field';
import { PrimaryButton } from '@/components/primary-button';
import { RequireAuth } from '@/components/require-auth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formErrorsFrom } from '@/i18n/api-errors';
import { useLanguage } from '@/i18n/language-provider';

/** Delete my account: explain what happens, then confirm by typing my phone number. */
function DeleteAccountContent() {
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const { user, logout } = useAuth();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const align = { textAlign: direction === 'rtl' ? 'right' : 'left' } as const;

  if (!user) return null;
  const usesPhone = Boolean(user.phone);

  const remove = async () => {
    if (!typed.trim()) {
      setError(usesPhone ? t('deleteAccount.typePhone') : t('deleteAccount.typeEmail'));
      return;
    }
    setDeleting(true);
    setError(undefined);
    try {
      await deleteAccountRequest(typed.trim());
      router.navigate('/');
      await logout(); // the account no longer exists: forget the login on this phone
    } catch (e) {
      setError(
        errorCode(e) === 'confirm_mismatch'
          ? usesPhone
            ? t('deleteAccount.mismatchPhone')
            : t('deleteAccount.mismatchEmail')
          : (formErrorsFrom(e, t).general ?? t('errors.unknown')),
      );
      setDeleting(false);
    }
  };

  const Item = ({ text, kept }: { text: string; kept?: boolean }) => (
    <View style={styles.item}>
      <Ionicons name={kept ? 'archive-outline' : 'close-circle-outline'} size={20} color={kept ? '#8A8F98' : '#D93025'} />
      <ThemedText type="small" style={[styles.flex, align]}>
        {text}
      </ThemedText>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle" style={align}>
          {t('deleteAccount.title')}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={align}>
          {t('deleteAccount.intro')}
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold" style={align}>
            {t('deleteAccount.erasedTitle')}
          </ThemedText>
          <Item text={t('deleteAccount.erasedData')} />
          <Item text={t('deleteAccount.erasedListings')} />
          <Item text={t('deleteAccount.erasedFavorites')} />
        </ThemedView>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold" style={align}>
            {t('deleteAccount.keptTitle')}
          </ThemedText>
          <Item kept text={t('deleteAccount.keptMessages')} />
          <Item kept text={t('deleteAccount.keptSafety')} />
        </ThemedView>

        <FormField
          label={usesPhone ? t('deleteAccount.typePhone') : t('deleteAccount.typeEmail')}
          value={typed}
          onChangeText={(value) => {
            setTyped(value);
            setError(undefined);
          }}
          placeholder={usesPhone ? '0555 12 34 56' : 'nom@exemple.com'}
          keyboardType={usesPhone ? 'phone-pad' : 'email-address'}
          autoCapitalize="none"
          error={error}
        />
        <PrimaryButton title={t('deleteAccount.confirm')} onPress={remove} loading={deleting} variant="danger" />
        <PrimaryButton title={t('listing.cancel')} onPress={() => router.back()} variant="secondary" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function DeleteAccountScreen() {
  return (
    <RequireAuth next="/delete-account">
      <ThemedView style={styles.flex}>
        <DeleteAccountContent />
      </ThemedView>
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: 480, alignSelf: 'center' },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
});
