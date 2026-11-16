import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { absoluteUrl } from '@/api/client';
import { ThemedText } from '@/components/themed-text';

const COLORS = ['#208AEF', '#1E8E3E', '#E37400', '#8E44AD', '#D93025', '#00897B'];

/** A round profile photo, or the first letter of the name on a coloured circle. */
export function Avatar({ uri, name, size = 44 }: { uri?: string | null; name: string; size?: number }) {
  const round = { width: size, height: size, borderRadius: size / 2 };
  const source = absoluteUrl(uri);
  if (source) {
    return <Image source={{ uri: source }} style={round} contentFit="cover" accessibilityIgnoresInvertColors />;
  }
  const letter = name.trim().charAt(0).toUpperCase() || '?';
  const color = COLORS[(letter.codePointAt(0) ?? 0) % COLORS.length];
  return (
    <View style={[styles.letterCircle, round, { backgroundColor: color }]}>
      <ThemedText type="smallBold" style={[styles.letter, { fontSize: size * 0.42, lineHeight: size * 0.55 }]}>
        {letter}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  letterCircle: { alignItems: 'center', justifyContent: 'center' },
  letter: { color: '#ffffff' },
});
