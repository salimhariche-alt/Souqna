import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { PhotoCarousel, type Photo } from '@/components/photo-carousel';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLanguage } from '@/i18n/language-provider';

type Props = {
  photos: Photo[];
  /** The photo to open on, or null when closed. */
  openAt: number | null;
  onClose: () => void;
};

/** Full-screen photos on a black background: swipe, see "2 / 5", close. */
export function PhotoViewer({ photos, openAt, onClose }: Props) {
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const { height } = useWindowDimensions();
  const [index, setIndex] = useState(openAt ?? 0);

  return (
    <Modal
      visible={openAt !== null}
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => setIndex(openAt ?? 0)}
      statusBarTranslucent>
      {/* A Modal opens outside the main screen, so set the direction again here. */}
      <View style={[styles.background, { direction }]}>
        {openAt !== null && (
          <PhotoCarousel
            photos={photos}
            height={height}
            initialIndex={openAt}
            onIndexChange={setIndex}
            fit="contain"
          />
        )}
        <SafeAreaView style={styles.topBar} pointerEvents="box-none">
          <ThemedText type="smallBold" style={styles.counter}>
            {`${index + 1} / ${photos.length}`}
          </ThemedText>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('listing.closePhoto')}
            hitSlop={10}
            style={styles.close}>
            <Ionicons name="close" size={28} color="#ffffff" />
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: '#000000' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  counter: { color: '#ffffff' },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
});
