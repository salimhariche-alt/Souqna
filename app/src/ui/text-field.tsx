import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { useLanguage } from '@/i18n/language-provider';
import { textStyleFor, useTokens } from '@/theme';

import { AppText } from './text';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  hint?: string;
  error?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
};

/**
 * A labelled text box (cream, warm border, corners 16, 54 high) with a hint or an error
 * underneath. Right-to-left and in the Arabic font when the app is in Arabic.
 */
export function TextField({ label, hint, error, icon, multiline, ...inputProps }: Props) {
  const tk = useTokens();
  const { direction, language } = useLanguage();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? tk.color.danger : focused ? tk.color.primary : tk.color.borderStrong;

  return (
    <View style={styles.container}>
      <AppText variant="smallStrong">{label}</AppText>
      <View
        style={[
          styles.box,
          {
            backgroundColor: tk.color.surface,
            borderColor,
            borderRadius: tk.radius.lg,
            paddingHorizontal: tk.space.lg,
            minHeight: tk.buttonHeight,
          },
        ]}>
        {icon ? <Ionicons name={icon} size={20} color={tk.color.textMuted} /> : null}
        <TextInput
          {...inputProps}
          multiline={multiline}
          accessibilityLabel={label}
          placeholderTextColor={tk.color.textMuted}
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
            multiline && styles.multiline,
            {
              color: tk.color.text,
              textAlign: direction === 'rtl' ? 'right' : 'left',
              writingDirection: direction,
            },
          ]}
        />
      </View>
      {error ? (
        <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" tone="secondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6, alignSelf: 'stretch' },
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1 },
  input: { flex: 1, paddingVertical: 12 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
});
