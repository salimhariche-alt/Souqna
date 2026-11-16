import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { useLanguage } from '@/i18n/language-provider';
import { useTokens } from '@/theme';

import { AppText } from './text';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  hint?: string;
  error?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
};

/** A labelled text box with a hint or an error underneath. Right-to-left in Arabic. */
export function TextField({ label, hint, error, icon, multiline, ...inputProps }: Props) {
  const tk = useTokens();
  const { direction } = useLanguage();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? tk.color.danger : focused ? tk.color.primary : tk.color.border;

  return (
    <View style={styles.container}>
      <AppText variant="smallStrong">{label}</AppText>
      <View
        style={[
          styles.box,
          {
            backgroundColor: tk.color.surface,
            borderColor,
            borderRadius: tk.radius.md,
            paddingHorizontal: tk.space.lg,
            minHeight: tk.minTouch,
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
            tk.text.body,
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
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5 },
  input: { flex: 1, paddingVertical: 12 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
});
