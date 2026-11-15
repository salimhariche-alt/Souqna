import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { WILAYAS, wilayaLabel } from '@/constants/wilayas';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language-provider';

/** Lowercase and remove accents, so "bejaia" finds "Béjaïa". */
function simplify(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

type Props = {
  label: string;
  value: number | null;
  onChange: (code: number) => void;
  error?: string;
};

/** A field that opens a searchable list of the 58 wilayas. */
export function WilayaPicker({ label, value, onChange, error }: Props) {
  const { t } = useTranslation();
  const { language, direction } = useLanguage();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = simplify(query);
    if (!q) return WILAYAS;
    return WILAYAS.filter(
      (w) =>
        String(w.code) === q.replace(/^0/, '') ||
        simplify(w.fr).includes(q) ||
        w.ar.includes(query.trim()),
    );
  }, [query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">{label}</ThemedText>
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
      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}

      <Modal visible={open} animationType="slide" onRequestClose={close}>
        {/* A Modal opens outside the main screen, so set the direction again here. */}
        <ThemedView style={[styles.modal, { direction }]}>
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <ThemedText type="smallBold" style={styles.modalTitle}>
                {t('auth.chooseWilaya')}
              </ThemedText>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel={t('auth.close')}
                hitSlop={8}>
                <Ionicons name="close" size={26} color={theme.text} />
              </Pressable>
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('auth.searchWilaya')}
              placeholderTextColor={theme.textSecondary}
              autoCorrect={false}
              autoFocus
              style={[
                styles.search,
                {
                  backgroundColor: theme.backgroundElement,
                  color: theme.text,
                  textAlign: direction === 'rtl' ? 'right' : 'left',
                },
              ]}
            />
            <FlatList
              data={results}
              keyExtractor={(w) => String(w.code)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <ThemedText themeColor="textSecondary" style={styles.empty}>
                  {t('auth.noWilayaFound')}
                </ThemedText>
              }
              renderItem={({ item }) => {
                const selected = item.code === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item.code);
                      close();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.row,
                      { borderBottomColor: theme.backgroundSelected },
                      (pressed || selected) && { backgroundColor: theme.backgroundSelected },
                    ]}>
                    <ThemedText type={selected ? 'smallBold' : 'default'} style={styles.rowText}>
                      {wilayaLabel(item.code, language)}
                    </ThemedText>
                    {selected && <Ionicons name="checkmark" size={20} color="#208AEF" />}
                  </Pressable>
                );
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
  error: { color: '#D93025' },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.three,
  },
  modalTitle: { fontSize: 18 },
  search: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1 },
  empty: { padding: Spacing.four, textAlign: 'center' },
});
