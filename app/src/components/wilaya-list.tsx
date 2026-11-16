import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { WILAYAS, wilayaLabel } from '@/constants/wilayas';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language-provider';

/** Lowercase and remove accents, so "bejaia" finds "Béjaïa". */
function simplify(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

type Props = {
  value: number | null;
  onSelect: (code: number | null) => void;
  /** Adds a first row (e.g. "All wilayas") that selects null. */
  allLabel?: string;
  autoFocus?: boolean;
};

/** A search box plus the list of the 58 wilayas (French or Arabic names). */
export function WilayaList({ value, onSelect, allLabel, autoFocus = false }: Props) {
  const { t } = useTranslation();
  const { language, direction } = useLanguage();
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = simplify(query);
    const matches = !q
      ? WILAYAS
      : WILAYAS.filter(
          (w) =>
            String(w.code) === q.replace(/^0/, '') ||
            simplify(w.fr).includes(q) ||
            w.ar.includes(query.trim()),
        );
    const list: { code: number | null; label: string }[] = matches.map((w) => ({
      code: w.code,
      label: wilayaLabel(w.code, language),
    }));
    return allLabel && !q ? [{ code: null, label: allLabel }, ...list] : list;
  }, [query, language, allLabel]);

  return (
    <>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('auth.searchWilaya')}
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel={t('auth.searchWilaya')}
        autoCorrect={false}
        autoFocus={autoFocus}
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
        data={rows}
        keyExtractor={(row) => String(row.code ?? 'all')}
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
              onPress={() => onSelect(item.code)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.row,
                { borderBottomColor: theme.backgroundSelected },
                (pressed || selected) && { backgroundColor: theme.backgroundSelected },
              ]}>
              <ThemedText type={selected ? 'smallBold' : 'default'} style={styles.rowText}>
                {item.label}
              </ThemedText>
              {selected && <Ionicons name="checkmark" size={20} color={Brand.fill} />}
            </Pressable>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
