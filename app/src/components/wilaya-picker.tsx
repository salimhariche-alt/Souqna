import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WilayaList } from '@/components/wilaya-list';
import { Spacing } from '@/constants/theme';
import { wilayaLabel } from '@/constants/wilayas';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language-provider';
import { ListRow } from '@/ui';

type Props = {
  label: string;
  value: number | null;
  onChange: (code: number) => void;
  error?: string;
  /** 'field' (a text-box look, default) or 'row' (a list row: icon, label, value, arrow). */
  variant?: 'field' | 'row';
};

/** A form field that opens a searchable list of the 58 wilayas. */
export function WilayaPicker({ label, value, onChange, error, variant = 'field' }: Props) {
  const { t } = useTranslation();
  const { language, direction } = useLanguage();
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.container}>
      {variant === 'row' ? (
        <ListRow
          icon="location-outline"
          label={label}
          value={value ? wilayaLabel(value, language) : t('auth.chooseWilaya')}
          onPress={() => setOpen(true)}
        />
      ) : (
        <ThemedText type="smallBold">{label}</ThemedText>
      )}
      {variant === 'field' && (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.field,
          { backgroundColor: theme.backgroundElement },
          error ? styles.fieldError : null,
        ]}>
        <ThemedText themeColor={value ? 'text' : 'textSecondary'} style={styles.fieldText}>
          {value ? wilayaLabel(value, language) : t('auth.chooseWilaya')}
        </ThemedText>
        <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
      </Pressable>
      )}
      {error ? (
        <ThemedText themeColor="danger" type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        {/* A Modal opens outside the main screen, so set the direction again here. */}
        <ThemedView style={[styles.modal, { direction }]}>
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <ThemedText type="smallBold" style={styles.modalTitle}>
                {t('auth.chooseWilaya')}
              </ThemedText>
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t('auth.close')}
                hitSlop={8}>
                <Ionicons name="close" size={26} color={theme.text} />
              </Pressable>
            </View>
            <WilayaList
              value={value}
              autoFocus
              onSelect={(code) => {
                if (code !== null) onChange(code);
                setOpen(false);
              }}
            />
          </SafeAreaView>
        </ThemedView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one, alignSelf: 'stretch' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  fieldError: { borderColor: '#D93025' },
  fieldText: { flex: 1 },
  error: {},
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  modalTitle: { fontSize: 18 },
});
