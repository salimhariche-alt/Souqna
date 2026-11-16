import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language-provider';

export const MAX_PHOTOS = 8;
const SIZE = 96;

export type FormPhoto = {
  /** Stays the same while the photo is in the form (used as the list key). */
  key: string;
  /** What to show: a local file, or the photo's web address for photos already online. */
  uri: string;
  /** Set once the photo is on the server. */
  remoteId?: number;
  /** Still being made smaller. */
  preparing?: boolean;
};

type Props = {
  photos: FormPhoto[];
  onRemove: (key: string) => void;
  onMakeCover: (key: string) => void;
  onAdd: (source: 'camera' | 'gallery') => void;
  error?: string;
  disabled?: boolean;
};

/** Thumbnails of the listing's photos. The first one is the cover. */
export function PhotoStrip({ photos, onRemove, onMakeCover, onAdd, error, disabled }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { direction } = useLanguage();
  const full = photos.length >= MAX_PHOTOS;
  // The small round buttons sit in the top "end" corner: right in French, left in Arabic.
  const endCorner = direction === 'rtl' ? { left: 4 } : { right: 4 };
  const startCorner = direction === 'rtl' ? { right: 4 } : { left: 4 };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="smallBold">{t('sell.photos')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('sell.photoCount', { count: photos.length, max: MAX_PHOTOS })}
        </ThemedText>
      </View>

      <View style={styles.grid}>
        {photos.map((photo, index) => (
          <View
            key={photo.key}
            style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
            <Image source={{ uri: photo.uri }} style={styles.image} contentFit="cover" />
            {photo.preparing && (
              <View style={styles.overlay}>
                <ActivityIndicator color="#ffffff" />
              </View>
            )}
            {index === 0 ? (
              <View style={styles.coverBadge}>
                <ThemedText type="small" style={styles.coverText}>
                  {t('sell.cover')}
                </ThemedText>
              </View>
            ) : (
              <Pressable
                onPress={() => onMakeCover(photo.key)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={t('sell.makeCover', { number: index + 1 })}
                hitSlop={6}
                style={[styles.roundButton, styles.bottom, startCorner]}>
                <Ionicons name="star-outline" size={15} color="#ffffff" />
              </Pressable>
            )}
            <Pressable
              onPress={() => onRemove(photo.key)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={t('sell.removePhoto', { number: index + 1 })}
              hitSlop={6}
              style={[styles.roundButton, styles.top, endCorner]}>
              <Ionicons name="close" size={16} color="#ffffff" />
            </Pressable>
          </View>
        ))}

        {!full && (
          <>
            <AddTile icon="camera-outline" label={t('sell.camera')} onPress={() => onAdd('camera')} disabled={disabled} />
            <AddTile icon="images-outline" label={t('sell.gallery')} onPress={() => onAdd('gallery')} disabled={disabled} />
          </>
        )}
      </View>

      {error ? (
        <ThemedText type="small" style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {full ? t('sell.photosFull') : t('sell.photosHint')}
        </ThemedText>
      )}
    </View>
  );
}

function AddTile({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: 'camera-outline' | 'images-outline';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.thumb,
        styles.addTile,
        { borderColor: theme.backgroundSelected },
        pressed && styles.pressed,
      ]}>
      <Ionicons name={icon} size={28} color="#208AEF" />
      <ThemedText type="small" style={styles.addText} numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two, alignSelf: 'stretch' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  thumb: { width: SIZE, height: SIZE, borderRadius: Spacing.two, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  coverBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 2,
    alignItems: 'center',
    backgroundColor: 'rgba(32,138,239,0.9)',
  },
  coverText: { color: '#ffffff', fontSize: 12 },
  roundButton: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  top: { top: 4 },
  bottom: { bottom: 4 },
  addTile: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  addText: { color: '#208AEF', fontSize: 12 },
  pressed: { opacity: 0.6 },
  error: { color: '#D93025' },
});
