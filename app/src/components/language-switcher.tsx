import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { LANGUAGE_NAMES, LANGUAGES } from '@/i18n';
import { useLanguage } from '@/i18n/language-provider';

/** Three buttons: Français / العربية / English. */
export function LanguageSwitcher() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

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
});
