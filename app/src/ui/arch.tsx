import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { type ComponentProps, type PropsWithChildren, useState } from 'react';
import { type DimensionValue, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTokens } from '@/theme';

type FrameProps = PropsWithChildren<{
  /** Fixed width in pixels. Without it, the arch takes the width it is given. */
  width?: DimensionValue;
  height?: DimensionValue;
  /** width / height, e.g. 0.8 = a little taller than wide (the default). */
  aspectRatio?: number;
  /** Background colour inside the arch. */
  color?: string;
  /** Corner radius at the bottom (slightly rounded). */
  bottomRadius?: number;
  /** An optional border, e.g. the white outline of the Welcome photos. */
  borderColor?: string;
  borderWidth?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}>;

/**
 * The "Moorish arch" shape: the top is a full half-circle, the bottom corners are almost
 * square - rendered exactly like the design files' "border-radius: 999px 999px B B".
 * Anything inside (a photo, a pattern, a letter) is cut to the shape.
 */
export function ArchFrame({
  width,
  height,
  aspectRatio = 0.8,
  color,
  bottomRadius,
  borderColor,
  borderWidth = 0,
  style,
  accessibilityLabel,
  children,
}: FrameProps) {
  const tk = useTokens();
  // Measured size (known at once when width and height are numbers).
  const [measured, setMeasured] = useState({
    w: typeof width === 'number' ? width : 0,
    h: typeof height === 'number' ? height : 0,
  });
  const fixed = typeof width === 'number' && typeof height === 'number';
  const w = typeof width === 'number' ? width : measured.w;
  const h = typeof height === 'number' ? height : measured.h;
  // Exactly like the design files (CSS "border-radius: 999px 999px B B"): when the
  // corners don't fit, the browser shrinks ALL of them by the same factor. So the top
  // becomes a half-circle and the bottom corners get very small (18px -> about 3px).
  const bottom = bottomRadius ?? tk.radius.sm;
  const factor = w > 0 ? Math.min(1, w / (2 * 999), h > 0 ? h / (999 + bottom) : 1) : 0;
  const top = w > 0 ? 999 * factor : tk.radius.xxl;
  const bottomCorner = w > 0 ? bottom * factor : bottom;
  return (
    <View
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      onLayout={
        fixed
          ? undefined
          : (e) => setMeasured({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
      style={[
        styles.frame,
        {
          width,
          height,
          aspectRatio: height === undefined ? aspectRatio : undefined,
          backgroundColor: color,
          borderTopLeftRadius: top,
          borderTopRightRadius: top,
          borderBottomLeftRadius: bottomCorner,
          borderBottomRightRadius: bottomCorner,
          borderColor,
          borderWidth,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

type ImageProps = Omit<FrameProps, 'children' | 'color'> & {
  /** The photo. Without it, the soft tint and the icon are shown. */
  uri?: string | null;
  /** Placeholder background, e.g. tk.tints[2]. Default: the first tint (clay). */
  tint?: string;
  /** Placeholder icon (e.g. "bag-handle-outline", "shirt-outline"). */
  icon?: ComponentProps<typeof Ionicons>['name'];
  iconSize?: number;
};

/** A photo cut into an arch, with a soft-tint placeholder and an icon while there is none. */
export function ArchImage({ uri, tint, icon = 'bag-handle-outline', iconSize = 40, ...frame }: ImageProps) {
  const tk = useTokens();
  return (
    <ArchFrame color={tint ?? tk.color.tint1} {...frame}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <View style={styles.center}>
          <Ionicons name={icon} size={iconSize} color={tk.color.tintIcon} />
        </View>
      )}
    </ArchFrame>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
