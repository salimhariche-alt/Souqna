import { useState } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { BrandPalette } from '@/theme';

type Props = {
  /** Tile size (the design uses 50). */
  cell?: number;
  /** Line colour of the stars (default white). */
  color?: string;
  /** How visible the lines are (default 0.2 = 20%). */
  opacity?: number;
  /** Colour of the dot in each star (default saffron, at 55%). */
  dotColor?: string;
  dotOpacity?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Zellige pattern, exactly as in the design (welcome.html): in every 50 x 50 tile, an
 * 8-point star drawn as a square plus a diamond (thin white lines, 20%), and a saffron
 * dot (55%) in the middle. The tiles start at the top-left corner. It fills the box it
 * is placed in (put it first inside an ArchFrame). Decorative: screen readers skip it.
 */
export function ZelligePattern({
  cell = 50,
  color = '#FFFFFF',
  opacity = 0.2,
  dotColor = BrandPalette.saffron,
  dotOpacity = 0.55,
  style,
}: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const k = cell / 50; // the design's numbers are for a 50 x 50 tile
  const columns = Math.ceil(size.width / cell);
  const rows = Math.ceil(size.height / cell);
  const tiles = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = col * cell;
      const y = row * cell;
      const p = (dx: number, dy: number) => `${(x + dx * k).toFixed(2)} ${(y + dy * k).toFixed(2)}`;
      // M14 14h22v22H14z  M25 9.5l15.5 15.5-15.5 15.5-15.5-15.5z
      const d =
        `M${p(14, 14)} L${p(36, 14)} L${p(36, 36)} L${p(14, 36)} Z ` +
        `M${p(25, 9.5)} L${p(40.5, 25)} L${p(25, 40.5)} L${p(9.5, 25)} Z`;
      tiles.push(
        <Path key={`s${row}-${col}`} d={d} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={1} />,
        <Circle
          key={`d${row}-${col}`}
          cx={x + 25 * k}
          cy={y + 25 * k}
          r={3 * k}
          fill={dotColor}
          fillOpacity={dotOpacity}
        />,
      );
    }
  }
  return (
    <View
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {size.width > 0 ? (
        <Svg width={size.width} height={size.height}>
          {tiles}
        </Svg>
      ) : null}
    </View>
  );
}
