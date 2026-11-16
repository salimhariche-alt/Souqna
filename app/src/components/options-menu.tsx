import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language-provider';

export type MenuOption = {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  danger?: boolean;
};

type Props = { visible: boolean; options: MenuOption[]; onClose: () => void };

/** The list that slides up from the bottom when "⋯" is tapped. */
export function OptionsMenu({ visible, options, onClose }: Props) {
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { direction }]}>
        <Pressable style={styles.flex} onPress={onClose} accessibilityLabel={t('listing.cancel')} />
        <ThemedView style={styles.sheet}>
          <SafeAreaView edges={['bottom']} style={styles.content}>
            {options.map((option) => (
              <Pressable
                key={option.label}
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  option.onPress();
                }}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <Ionicons
                  name={option.icon}
                  size={22}
                  color={option.danger ? '#D93025' : theme.text}
                />
                <ThemedText themeColor="danger" style={[styles.label, option.danger && styles.danger]}>
                  {option.label}
                </ThemedText>
              </Pressable>
            ))}
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
              <ThemedText type="smallBold" themeColor="primary" style={styles.cancelText}>
                {t('listing.cancel')}
              </ThemedText>
            </Pressable>
          </SafeAreaView>
        </ThemedView>
      </View>
    </Modal>
  );
}

/** The round "⋯" button that opens the menu. */
export function MoreButton({ onPress, onPhoto = false }: { onPress: () => void; onPhoto?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('safety.moreOptions')}
      hitSlop={8}
      style={({ pressed }) => [
        styles.more,
        { backgroundColor: onPhoto ? 'rgba(0,0,0,0.45)' : theme.backgroundSelected },
        pressed && styles.pressed,
      ]}>
      <Ionicons name="ellipsis-horizontal" size={20} color={onPhoto ? '#ffffff' : theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: Spacing.four, borderTopRightRadius: Spacing.four },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  label: { flex: 1, fontSize: 16 },
  danger: {},
  pressed: { opacity: 0.6 },
  cancel: { alignItems: 'center', paddingVertical: Spacing.three },
  cancelText: {},
  more: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
