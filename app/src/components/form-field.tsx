import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { useLanguage } from '@/i18n/language-provider';
import { textStyleFor, useTokens } from '@/theme';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string;
  hint?: string;
  /** Password field: hides the text and adds a show/hide button. */
  password?: boolean;
};

/**
 * A labelled text box (Log in, Sign up...) in the "Warm & Local" style: cream, a warm
 * border (terracotta when typing, danger on error), corners 16, 54 high. Right-to-left
 * and in the Arabic font when the app is in Arabic.
 */
export function FormField({ label, error, hint, password = false, ...inputProps }: Props) {
  const tk = useTokens();
  const { t } = useTranslation();
  const { direction, language } = useLanguage();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  const borderColor = error ? tk.color.danger : focused ? tk.color.primary : tk.color.borderStrong;

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={[styles.inputRow, { backgroundColor: tk.color.surface, borderColor }]}>
        <TextInput
          {...inputProps}
          secureTextEntry={password && hidden}
          placeholderTextColor={tk.color.textMuted}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          style={[
            textStyleFor('body', language === 'ar'),
            styles.input,
            inputProps.multiline && styles.multiline,
            {
              color: tk.color.text,
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
            hitSlop={10}
            style={styles.eye}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={tk.color.textSecondary} />
          </Pressable>
        )}
      </View>
      {error ? (
        <ThemedText themeColor="danger" type="small" accessibilityLiveRegion="polite">
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
  container: { gap: 6, alignSelf: 'stretch' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 15 },
  multiline: { minHeight: 110, maxHeight: 220, textAlignVertical: 'top' },
  eye: { paddingStart: 8 },
});
