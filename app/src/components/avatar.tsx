import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { absoluteUrl } from '@/api/client';
import { FontFiles, useTokens } from '@/theme';
import { ArchFrame } from '@/ui';

/**
 * A profile picture in the "Warm & Local" arch (like the seller card in listing.html):
 * the photo, or the first letter in Fraunces on a soft tint (always the same tint for
 * the same name). `size` is the width; the arch is a little taller (x 1.12).
 */
export function Avatar({ uri, name, size = 44 }: { uri?: string | null; name: string; size?: number }) {
  const tk = useTokens();
  const source = absoluteUrl(uri);
  const letter = name.trim().charAt(0).toUpperCase() || '?';
  const tint = tk.tints[(letter.codePointAt(0) ?? 0) % tk.tints.length];
  return (
    <ArchFrame width={size} height={Math.round(size * 1.12)} color={tint} bottomRadius={Math.max(6, size / 5)}>
      {source ? (
        <Image source={{ uri: source }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.center}>
          <Text
            style={{
              fontFamily: FontFiles.serifBold,
              fontSize: size * 0.4,
              lineHeight: size * 0.52,
              color: tk.color.text,
            }}>
            {letter}
          </Text>
        </View>
      )}
    </ArchFrame>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
});
