import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { LANGUAGE_NAMES, LANGUAGES, type Language } from '@/i18n';
import { useLanguage } from '@/i18n/language-provider';

const SHORT_NAMES: Record<Language, string> = { fr: 'FR', ar: 'ع', en: 'EN' };

/**
 * Three buttons: Français / العربية / English.
 * `compact` shows FR / ع / EN in one small row (for a screen header).
 */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  if (compact) {
    return (
      <View style={[styles.row, styles.compactRow]}>
        {LANGUAGES.map((code) => {
          const selected = code === language;
          return (
            <Pressable
              key={code}
              onPress={() => setLanguage(code)}
              accessibilityRole="button"
              accessibilityLabel={LANGUAGE_NAMES[code]}
              accessibilityState={{ selected }}
              hitSlop={6}
              style={({ pressed }) => [
                styles.compactButton,
                selected && styles.compactSelected,
                pressed && styles.pressed,
              ]}>
              <ThemedText
                type="smallBold"
                themeColor={selected ? undefined : 'textSecondary'}
                style={selected ? styles.compactSelectedText : undefined}>
                {SHORT_NAMES[code]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('language.label')}
      </ThemedText>
      <View style={styles.row}>
        {LANGUAGES.map((code) => {
          const selected = code === language;
          return (
            <Pressable
              key={code}
              onPress={() => setLanguage(code)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView
                type={selected ? 'backgroundSelected' : 'backgroundElement'}
                style={[styles.button, selected && styles.buttonSelected]}>
                <ThemedText type={selected ? 'smallBold' : 'small'}>
                  {LANGUAGE_NAMES[code]}
                </ThemedText>
              </ThemedView>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  buttonSelected: { borderColor: '#208AEF' },
  pressed: { opacity: 0.7 },
  compactRow: { gap: Spacing.one, marginHorizontal: Spacing.three },
  compactButton: {
    minWidth: 32,
    alignItems: 'center',
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
  },
  compactSelected: { backgroundColor: '#208AEF' },
  compactSelectedText: { color: '#ffffff' },
});
