import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { Spacing } from '@/constants/theme';
import { useLanguage } from '@/i18n/language-provider';

export type Photo = { id: number; image: string };

type Props = {
  photos: Photo[];
  height: number;
  /** Which photo to show first (0 = first photo). */
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  onPressPhoto?: (index: number) => void;
  /** "cover" fills the box (may crop); "contain" shows the whole photo. */
  fit?: 'cover' | 'contain';
  dotColor?: string;
};

/**
 * Swipe through photos one at a time, with dots showing which photo is visible.
 *
 * Right-to-left: phone scroll views always start at the left edge, so instead of
 * flipping the scrolling we keep it left-to-right, show the photos in reverse order
 * and start at the end. Result in Arabic: the first photo is on the right and you
 * swipe from left to right to see the next one - on Android, iPhone and the web.
 */
export function PhotoCarousel({
  photos,
  height,
  initialIndex = 0,
  onIndexChange,
  onPressPhoto,
  fit = 'cover',
  dotColor = '#ffffff',
}: Props) {
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const rtl = direction === 'rtl';
  const listRef = useRef<FlatList<Photo>>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(initialIndex);

  const count = photos.length;
  const shown = useMemo(() => (rtl ? [...photos].reverse() : photos), [photos, rtl]);
  // Position on screen (0 = left) <-> photo number (0 = first photo).
  const toPhoto = (position: number) => (rtl ? count - 1 - position : position);
  const toPosition = toPhoto; // the same flip works both ways

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const position = Math.round(event.nativeEvent.contentOffset.x / width);
    const photo = Math.min(count - 1, Math.max(0, toPhoto(position)));
    if (photo !== index) {
      setIndex(photo);
      onIndexChange?.(photo);
    }
  };

  const goTo = (photo: number) => {
    listRef.current?.scrollToIndex({ index: toPosition(photo), animated: true });
  };

  // Dots go in the reading direction: first photo's dot on the right in Arabic.
  const dots = rtl ? [...photos.keys()].reverse() : [...photos.keys()];

  return (
    <View
      style={[styles.container, { height }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && (
        <FlatList
          // Rebuild when the language direction or size changes, to start at the right photo.
          key={`${direction}-${width}`}
          ref={listRef}
          data={shown}
          keyExtractor={(photo) => String(photo.id)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={toPosition(index)}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onScroll={onScroll}
          scrollEventThrottle={16}
          renderItem={({ item, index: position }) => (
            <Pressable
              onPress={() => onPressPhoto?.(toPhoto(position))}
              disabled={!onPressPhoto}
              accessibilityRole={onPressPhoto ? 'imagebutton' : 'image'}
              accessibilityLabel={t('listing.photoCount', {
                current: toPhoto(position) + 1,
                total: count,
              })}
              style={{ width, height }}>
              <Image
                source={{ uri: item.image }}
                style={StyleSheet.absoluteFill}
                contentFit={fit}
                transition={150}
              />
            </Pressable>
          )}
        />
      )}
      {count > 1 && (
        <View style={styles.dots} pointerEvents="box-none">
          {dots.map((photo) => (
            <Pressable
              key={photo}
              onPress={() => goTo(photo)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('listing.photoCount', { current: photo + 1, total: count })}
              style={[
                styles.dot,
                { backgroundColor: dotColor },
                photo === index ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Always left-to-right inside: see the explanation above.
  container: { width: '100%', direction: 'ltr' },
  dots: {
    position: 'absolute',
    bottom: Spacing.three,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { opacity: 1, transform: [{ scale: 1.25 }] },
  dotInactive: { opacity: 0.5 },
});
