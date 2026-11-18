import { StyleSheet, Text, View } from 'react-native';

import { FontFiles, useTokens } from '@/theme';

/**
 * The word mark, exactly as in the design: "sougna" (Fraunces 700, 26px, -0.5px,
 * terracotta) and "سوقنا" (Noto Naskh Arabic 700, 16px, secondary colour), 8px apart,
 * on the same baseline. In Arabic mode the row is mirrored with the rest of the screen.
 */
export function Logo({ size = 26 }: { size?: number }) {
  const tk = useTokens();
  const arabicSize = Math.round((size * 16) / 26);
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="header"
      accessibilityLabel="Sougna, سوقنا">
      <Text
        style={{
          fontFamily: FontFiles.serifBold,
          fontSize: size,
          lineHeight: Math.round(size * 1.25),
          letterSpacing: -0.5,
          color: tk.color.primary,
        }}>
        sougna
      </Text>
      <Text
        style={{
          fontFamily: FontFiles.arabicBold,
          fontSize: arabicSize,
          lineHeight: Math.round(size * 1.25),
          color: tk.color.textSecondary,
          writingDirection: 'rtl',
        }}>
        سوقنا
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
});
