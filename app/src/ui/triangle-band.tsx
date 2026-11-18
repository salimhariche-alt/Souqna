import { useState } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { BrandPalette } from '@/theme';

type Props = {
  /** Fixed width (the Welcome band is 300). Without it: the width it is given. */
  width?: number;
  /** Height of the band (the design uses 12). */
  height?: number;
  /** Width of one triangle (the design uses 12: a terracotta + saffron pair = 24). */
  size?: number;
  /** The colours, repeated in this order (default terracotta, saffron). */
  colors?: readonly string[];
  /** The whole band's opacity (the design uses 0.85). */
  opacity?: number;
  /** How far below the top the peaks are (welcome.html: 1; home.html: 2). */
  peak?: number;
  /**
   * home.html: a small triangle in this colour (Casbah blue) in the right half of every
   * big one ("M7 14L10.5 8L14 14z"). Not drawn when empty.
   */
  accentColor?: string;
  /** Peak of the small triangles (home.html: 8 for a 14 px band). */
  accentPeak?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * The Kabyle triangle band, exactly as in the design: a row of triangles standing on the
 * bottom line, peak 1 px below the top ("M0 12L6 1L12 12z"), alternating terracotta and
 * saffron, from the left edge (the last one is cut off, like a pattern). Same colours in
 * light and dark mode. Decorative: screen readers skip it.
 */
export function TriangleBand({
  width,
  height = 12,
  size = 12,
  colors = [BrandPalette.terracotta, BrandPalette.saffron],
  opacity = 0.85,
  peak = 1,
  accentColor,
  accentPeak = (height * 8) / 14,
  style,
}: Props) {
  const [measured, setMeasured] = useState(width ?? 0);
  const w = width ?? measured;
  const count = Math.ceil(w / size);
  const triangles = [];
  for (let i = 0; i < count; i++) {
    const x = i * size;
    triangles.push(
      <Path
        key={i}
        d={`M${x} ${height}L${x + size / 2} ${peak}L${x + size} ${height}z`}
        fill={colors[i % colors.length]}
      />,
    );
    if (accentColor) {
      triangles.push(
        <Path
          key={`a${i}`}
          d={`M${x + size / 2} ${height}L${x + (size * 3) / 4} ${accentPeak}L${x + size} ${height}z`}
          fill={accentColor}
        />,
      );
    }
  }
  return (
    <View
      style={[{ height, width: width ?? '100%', overflow: 'hidden' }, style]}
      onLayout={width ? undefined : (e) => setMeasured(e.nativeEvent.layout.width)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {w > 0 ? (
        <Svg width={w} height={height}>
          <G opacity={opacity}>{triangles}</G>
        </Svg>
      ) : null}
    </View>
  );
}
