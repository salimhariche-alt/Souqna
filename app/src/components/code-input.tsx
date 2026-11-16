import { type ComponentRef, useRef } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { onlyDigits } from '@/utils/digits';

const LENGTH = 6;

type Props = {
  value: string;
  onChange: (code: string) => void;
  /** Called once all 6 digits are typed. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  error?: boolean;
  accessibilityLabel: string;
};

/**
 * Six boxes for the SMS code. Behind them is one hidden text box marked as an
 * "SMS code" field, which lets Android (and iOS) offer to fill in the code from
 * the SMS automatically. The digits always go left to right, even in Arabic.
 */
export function CodeInput({ value, onChange, onComplete, disabled, error, accessibilityLabel }: Props) {
  const theme = useTheme();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const change = (text: string) => {
    const code = onlyDigits(text).slice(0, LENGTH); // also turns ٠١٢ into 012
    onChange(code);
    if (code.length === LENGTH) onComplete?.(code);
  };

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      disabled={disabled}
      accessible={false}
      style={styles.row}>
      {Array.from({ length: LENGTH }, (_, i) => {
        const digit = value[i] ?? '';
        const isCurrent = !disabled && i === Math.min(value.length, LENGTH - 1);
        return (
          <View
            key={i}
            style={[
              styles.box,
              { backgroundColor: theme.backgroundElement, borderColor: 'transparent' },
              isCurrent && styles.boxCurrent,
              error && styles.boxError,
              disabled && styles.boxDisabled,
            ]}>
            <ThemedText type="subtitle" style={styles.digit}>
              {digit}
            </ThemedText>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={change}
        editable={!disabled}
        autoFocus
        keyboardType="number-pad"
        maxLength={LENGTH}
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        importantForAutofill="yes"
        accessibilityLabel={accessibilityLabel}
        caretHidden
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Codes are read left to right in every language.
  row: { flexDirection: 'row', direction: 'ltr', justifyContent: 'center', gap: Spacing.two },
  box: {
    width: 46,
    height: 56,
    borderRadius: Spacing.two,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxCurrent: { borderColor: Brand.fill },
  boxError: { borderColor: '#D93025' },
  boxDisabled: { opacity: 0.5 },
  digit: { lineHeight: 40 },
  // Covers the boxes so a tap anywhere focuses it, but can't be seen.
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.01,
    color: 'transparent',
  },
});
