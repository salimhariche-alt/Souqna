import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useLanguage } from '@/i18n/language-provider';
import { useTokens } from '@/theme';

import { Button } from './button';
import { AppText } from './text';

export type ChoiceGroup<T> = { title?: string; options: { value: T; label: string }[] };

type Props<T> = {
  visible: boolean;
  title: string;
  /** One or more lists of choices (e.g. main categories, then sub-categories). */
  groups?: ChoiceGroup<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
  onClose: () => void;
  /** Quick-pick chips above the free text box (e.g. common sizes). */
  suggestions?: string[];
  /** A free text box (e.g. any size or brand) with an OK button. */
  freeText?: { value: string; placeholder: string; maxLength: number; onSubmit: (text: string) => void };
};

/** A sheet that slides up with choices (✓ on the selected one), and/or a text box. */
export function ChoiceSheet<T extends string | number>({
  visible,
  title,
  groups = [],
  selected,
  onSelect,
  onClose,
  suggestions,
  freeText,
}: Props<T>) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { direction } = useLanguage();
  const [text, setText] = useState('');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={() => setText(freeText?.value ?? '')}>
      <KeyboardAvoidingView
        style={[styles.backdrop, { backgroundColor: tk.color.overlay, direction }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.flex} onPress={onClose} accessibilityLabel={t('listing.cancel')} />
        <View style={[styles.sheet, { backgroundColor: tk.color.background, borderTopLeftRadius: tk.radius.xl, borderTopRightRadius: tk.radius.xl }]}>
          <SafeAreaView edges={['bottom']} style={styles.flexShrink}>
            <View style={[styles.header, { padding: tk.space.lg }]}>
              <AppText variant="title" style={styles.flex}>
                {title}
              </AppText>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('auth.close')} hitSlop={10}>
                <Ionicons name="close" size={26} color={tk.color.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: tk.space.lg, paddingBottom: tk.space.lg, gap: tk.space.md }} keyboardShouldPersistTaps="handled">
              {freeText && (
                <View style={{ gap: tk.space.md }}>
                  {suggestions?.length ? (
                    <View style={styles.chips}>
                      {suggestions.map((s) => {
                        const isSelected = s === freeText.value;
                        return (
                          <Pressable
                            key={s}
                            onPress={() => freeText.onSubmit(s)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSelected }}
                            style={[styles.chip, { borderRadius: tk.radius.full, backgroundColor: isSelected ? tk.color.primary : tk.color.surface }]}>
                            <AppText variant="smallStrong" style={{ color: isSelected ? tk.color.onPrimary : tk.color.text }}>
                              {s}
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                  <View style={[styles.inputRow, { gap: tk.space.sm }]}>
                    <TextInput
                      value={text}
                      onChangeText={setText}
                      placeholder={freeText.placeholder}
                      placeholderTextColor={tk.color.textMuted}
                      maxLength={freeText.maxLength}
                      accessibilityLabel={freeText.placeholder}
                      returnKeyType="done"
                      onSubmitEditing={() => freeText.onSubmit(text.trim())}
                      style={[
                        tk.text.body,
                        styles.input,
                        {
                          color: tk.color.text,
                          backgroundColor: tk.color.surface,
                          borderRadius: tk.radius.md,
                          paddingHorizontal: tk.space.lg,
                          textAlign: direction === 'rtl' ? 'right' : 'left',
                          writingDirection: direction,
                        },
                      ]}
                    />
                    <Button title={t('choice.ok')} onPress={() => freeText.onSubmit(text.trim())} fullWidth={false} />
                  </View>
                </View>
              )}

              {groups.map((group, index) => (
                <View key={group.title ?? index} style={{ gap: tk.space.xs }}>
                  {group.title ? (
                    <AppText variant="smallStrong" tone="secondary" style={{ paddingTop: tk.space.sm }}>
                      {group.title}
                    </AppText>
                  ) : null}
                  {group.options.map((option) => {
                    const isSelected = option.value === selected;
                    return (
                      <Pressable
                        key={String(option.value)}
                        onPress={() => onSelect(option.value)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isSelected }}
                        style={({ pressed }) => [
                          styles.option,
                          {
                            minHeight: tk.minTouch + 4,
                            paddingHorizontal: tk.space.lg,
                            borderRadius: tk.radius.md,
                            backgroundColor: isSelected ? tk.color.primarySoft : pressed ? tk.color.surfaceAlt : tk.color.surface,
                          },
                        ]}>
                        <AppText variant={isSelected ? 'bodyStrong' : 'body'} tone={isSelected ? 'primary' : 'default'} style={styles.flex}>
                          {option.label}
                        </AppText>
                        {isSelected ? <Ionicons name="checkmark" size={22} color={tk.color.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  backdrop: { flex: 1 },
  sheet: { maxHeight: '85%', width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, minHeight: 48, paddingVertical: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
