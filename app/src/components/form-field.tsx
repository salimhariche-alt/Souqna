import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language-provider';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string;
  hint?: string;
  /** Password field: hides the text and adds a show/hide button. */
  password?: boolean;
};

/** A labelled text box with an error message underneath. Lines up right-to-left in Arabic. */
export function FormField({ label, error, hint, password = false, ...inputProps }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const [hidden, setHidden] = useState(true);

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View
        style={[
          styles.inputRow,
          { backgroundColor: theme.backgroundElement },
          error ? styles.inputRowError : null,
        ]}>
        <TextInput
          {...inputProps}
          secureTextEntry={password && hidden}
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel={label}
          style={[
            styles.input,
            {
              color: theme.text,
              textAlign: direction === 'rtl' ? 'right' : 'left',
              writingDirection: direction,
            },
          ]}
        />
        {password && (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? t('auth.showPassword') : t('auth.hidePassword')}
            hitSlop={8}
            style={styles.eye}>
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={theme.textSecondary}
            />
          </Pressable>
        )}
      </View>
      {error ? (
        <ThemedText type="small" style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one, alignSelf: 'stretch' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: Spacing.three,
  },
  inputRowError: { borderColor: '#D93025' },
  input: { flex: 1, paddingVertical: Spacing.three, fontSize: 16 },
  eye: { paddingStart: Spacing.two },
  error: { color: '#D93025' },
});
