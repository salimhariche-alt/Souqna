import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useState, type ComponentProps } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTokens } from '@/theme';

const TILE_WIDTH = 116;
const TILE_HEIGHT = 148;
const GAP = 12;
/** Pixels per second: slow and calm. */
const SPEED = 18;

/** Shown when there aren't enough real photos (offline, new app...). */
const PLACEHOLDER_ICONS: ComponentProps<typeof Ionicons>['name'][] = [
  'shirt-outline', 'watch-outline', 'bag-handle-outline', 'footsteps-outline',
  'glasses-outline', 'diamond-outline', 'happy-outline', 'home-outline',
];

type Props = {
  /** Photo addresses (cover photos of real listings). */
  photos: string[];
  /** Which way it drifts. */
  reverse?: boolean;
};

/**
 * One row of rounded photos drifting slowly sideways, forever. The row is drawn twice
 * side by side, so when the first copy has moved out, the second is exactly in its place.
 * Stops (and stays still) when the phone's "reduce motion" setting is on.
 */
export function PhotoMarquee({ photos, reverse = false }: Props) {
  const tk = useTokens();
  const [reduceMotion, setReduceMotion] = useState(false);
  const offset = useSharedValue(0);

  const tiles: (string | ComponentProps<typeof Ionicons>['name'])[] =
    photos.length >= 4 ? photos : PLACEHOLDER_ICONS;
  const rowWidth = tiles.length * (TILE_WIDTH + GAP);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    cancelAnimation(offset);
    if (reduceMotion) {
      offset.value = 0;
      return;
    }
    offset.value = 0;
    offset.value = withRepeat(
      withTiming(1, { duration: (rowWidth / SPEED) * 1000, easing: Easing.linear }),
      -1, // forever
    );
    return () => cancelAnimation(offset);
  }, [offset, rowWidth, reduceMotion]);

  const moving = useAnimatedStyle(() => ({
    transform: [{ translateX: (reverse ? offset.value - 1 : -offset.value) * rowWidth }],
  }));

  const renderTile = (tile: string, index: number) =>
    photos.length >= 4 ? (
      <Image
        key={index}
        source={{ uri: tile }}
        style={[styles.tile, { borderRadius: tk.radius.lg, backgroundColor: tk.color.surfaceAlt }]}
        contentFit="cover"
        transition={200}
      />
    ) : (
      <View key={index} style={[styles.tile, styles.placeholder, { borderRadius: tk.radius.lg, backgroundColor: tk.color.primarySoft }]}>
        <Ionicons name={tile as ComponentProps<typeof Ionicons>['name']} size={36} color={tk.color.primary} />
      </View>
    );

  return (
    // Photos have no reading direction: keep the row left-to-right even in Arabic,
    // so the endless loop lines up the same way.
    <View style={styles.clip} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Animated.View style={[styles.row, moving]}>
        {[...tiles, ...tiles].map((tile, index) => renderTile(tile, index))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', direction: 'ltr', height: TILE_HEIGHT },
  row: { flexDirection: 'row', gap: GAP, paddingStart: GAP },
  tile: { width: TILE_WIDTH, height: TILE_HEIGHT },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
