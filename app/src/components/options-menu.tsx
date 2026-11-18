import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { useLanguage } from '@/i18n/language-provider';
import { useTokens } from '@/theme';
import { DesignIcon } from '@/ui';

export type MenuOption = {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  danger?: boolean;
};

type Props = { visible: boolean; options: MenuOption[]; onClose: () => void };

/** The list that slides up from the bottom when "⋯" is tapped (cream, corners 24). */
export function OptionsMenu({ visible, options, onClose }: Props) {
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const tk = useTokens();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, { direction, backgroundColor: tk.color.overlay }]}>
        <Pressable style={styles.flex} onPress={onClose} accessibilityLabel={t('listing.cancel')} />
        <View style={[styles.sheet, { backgroundColor: tk.color.surface }]}>
          <SafeAreaView edges={['bottom']} style={styles.content}>
            <View style={[styles.handle, { backgroundColor: tk.color.borderStrong }]} />
            {options.map((option, i) => (
              <Pressable
                key={option.label}
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  option.onPress();
                }}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && { borderTopWidth: 1, borderTopColor: tk.color.divider },
                  pressed && { backgroundColor: tk.color.surfaceAlt },
                ]}>
                <Ionicons name={option.icon} size={21} color={option.danger ? tk.color.danger : tk.color.text} />
                <ThemedText style={[styles.label, { color: option.danger ? tk.color.danger : tk.color.text }]}>
                  {option.label}
                </ThemedText>
              </Pressable>
            ))}
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.cancel}>
              <ThemedText type="smallBold" themeColor="primary">
                {t('listing.cancel')}
              </ThemedText>
            </Pressable>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

/** The round "⋯" button (44px, cream with a thin border, as in listing.html). */
export function MoreButton({ onPress }: { onPress: () => void; onPhoto?: boolean }) {
  const { t } = useTranslation();
  const tk = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('safety.moreOptions')}
      style={({ pressed }) => [
        styles.more,
        { backgroundColor: pressed ? tk.color.surfaceAlt : tk.color.surface, borderColor: tk.color.border },
      ]}>
      <DesignIcon name="more" size={20} color={tk.color.text} strokeWidth={3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  content: { paddingHorizontal: 20, paddingTop: 10, width: '100%', maxWidth: 560, alignSelf: 'center' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 54, paddingHorizontal: 4 },
  label: { flex: 1, fontSize: 15 },
  cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  more: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
