import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useLanguage } from '@/i18n/language-provider';
import { useTokens } from '@/theme';
import { AppText } from '@/ui';

export const MAX_PHOTOS = 8;
const SIZE = 104;

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
  /** Add photos (the form asks: camera or gallery). */
  onAdd: () => void;
  error?: string;
  disabled?: boolean;
};

/**
 * The listing's photos. With none yet: a large dashed "Add photos" box. Then thumbnails
 * (the first one is the cover; ★ makes another the cover, ✕ removes) and a "+" tile.
 */
export function PhotoStrip({ photos, onRemove, onMakeCover, onAdd, error, disabled }: Props) {
  const { t } = useTranslation();
  const tk = useTokens();
  const { direction } = useLanguage();
  const full = photos.length >= MAX_PHOTOS;
  // The small round buttons: ✕ in the top "end" corner, ★ in the bottom "start" corner.
  const endCorner = direction === 'rtl' ? { left: 6 } : { right: 6 };
  const startCorner = direction === 'rtl' ? { right: 6 } : { left: 6 };
  const dashed = {
    borderWidth: 2,
    borderStyle: 'dashed' as const,
    borderColor: error ? tk.color.danger : tk.color.primary,
    backgroundColor: tk.color.primarySoft,
  };

  if (photos.length === 0) {
    return (
      <View style={{ gap: tk.space.sm }}>
        <Pressable
          onPress={onAdd}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t('sell.addPhotos')}
          style={({ pressed }) => [styles.bigBox, dashed, { borderRadius: tk.radius.xl, gap: tk.space.sm }, pressed && styles.pressed]}>
          <View style={[styles.bigIcon, { backgroundColor: tk.color.background }]}>
            <Ionicons name="camera-outline" size={32} color={tk.color.primary} />
          </View>
          <AppText variant="bodyStrong" tone="primary" align="center">
            {t('sell.addPhotos')}
          </AppText>
          <AppText variant="small" tone="secondary" align="center">
            {t('sell.addPhotosHint', { max: MAX_PHOTOS })}
          </AppText>
        </Pressable>
        {error ? (
          <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: tk.space.sm }}>
      <View style={[styles.grid, { gap: tk.space.sm }]}>
        {photos.map((photo, index) => (
          <View key={photo.key} style={[styles.thumb, { borderRadius: tk.radius.md, backgroundColor: tk.color.surfaceAlt }]}>
            <Image source={{ uri: photo.uri }} style={styles.image} contentFit="cover" />
            {photo.preparing && (
              <View style={styles.overlay}>
                <ActivityIndicator color="#ffffff" />
              </View>
            )}
            {index === 0 ? (
              <View style={[styles.coverBadge, { backgroundColor: tk.color.primary }]}>
                <AppText variant="caption" align="center" style={{ color: tk.color.onPrimary }}>
                  {t('sell.cover')}
                </AppText>
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
          <Pressable
            onPress={onAdd}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={t('sell.addPhotos')}
            style={({ pressed }) => [styles.thumb, styles.addTile, dashed, { borderRadius: tk.radius.md }, pressed && styles.pressed]}>
            <Ionicons name="add" size={30} color={tk.color.primary} />
          </Pressable>
        )}
      </View>
      {error ? (
        <AppText variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : (
        <AppText variant="small" tone="secondary">
          {full ? t('sell.photosFull') : t('sell.photosHint')} · {t('sell.photoCount', { count: photos.length, max: MAX_PHOTOS })}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bigBox: { minHeight: 190, alignItems: 'center', justifyContent: 'center', padding: 20 },
  bigIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  thumb: { width: SIZE, height: SIZE, overflow: 'hidden' },
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
  coverBadge: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 2 },
  roundButton: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  top: { top: 6 },
  bottom: { bottom: 6 },
  addTile: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
