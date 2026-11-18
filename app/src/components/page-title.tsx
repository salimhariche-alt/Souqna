import { StyleSheet, Text, View } from 'react-native';

import { useLanguage } from '@/i18n/language-provider';
import { FontFiles, useTokens } from '@/theme';

/**
 * A page title as in profile.html: the title in Fraunces 28 (-0.5px) and its Arabic name
 * on the other side (Noto Naskh Arabic 16, grey). In Arabic only the Arabic title shows.
 */
export function PageTitle({ title, arabic }: { title: string; arabic?: string }) {
  const tk = useTokens();
  const { language } = useLanguage();
  const ar = language === 'ar';
  return (
    <View style={styles.row}>
      <Text
        style={[styles.title, { color: tk.color.text, fontFamily: ar ? FontFiles.arabicBold : FontFiles.serifBold }]}
        accessibilityRole="header">
        {title}
      </Text>
      {!ar && arabic ? <Text style={[styles.arabic, { color: tk.color.textSecondary }]}>{arabic}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  title: { fontSize: 28, lineHeight: 36, letterSpacing: -0.5, flexShrink: 1 },
  arabic: { fontFamily: FontFiles.arabic, fontSize: 16, lineHeight: 26 },
});
