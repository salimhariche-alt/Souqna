import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { CONDITIONS, type Category } from '@/api/listings';
import { mainCategoriesInOrder } from '@/components/category-chips';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WilayaList } from '@/components/wilaya-list';
import { Brand, Spacing } from '@/constants/theme';
import { wilayaLabel } from '@/constants/wilayas';
import { categoryName } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language-provider';
import { NO_FILTERS, type SearchFilters } from '@/search/filter-chips';
import { onlyDigits, toAmount } from '@/utils/digits';

type Props = {
  visible: boolean;
  /** The filters currently applied (the sheet starts from these). */
  applied: SearchFilters;
  categories: Category[];
  onApply: (filters: SearchFilters) => void;
  onClose: () => void;
};

/** A choice button that can be selected (used for category and condition). */
function OptionChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.option,
        { backgroundColor: selected ? Brand.fill : theme.backgroundElement },
      ]}>
      <ThemedText type="smallBold" style={selected ? styles.optionTextSelected : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {children}
    </View>
  );
}

/**
 * Slides up from the bottom: category, wilaya, price range, size and condition.
 * Changes only count when "Apply" is tapped; closing the sheet throws them away.
 */
export function FiltersSheet({ visible, applied, categories, onApply, onClose }: Props) {
  const { t } = useTranslation();
  const { language, direction } = useLanguage();
  const theme = useTheme();
  const [page, setPage] = useState<'main' | 'wilaya'>('main');
  const [draft, setDraft] = useState<SearchFilters>(applied);
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');

  const reset = (filters: SearchFilters) => {
    setDraft(filters);
    setMinText(filters.minPrice ? String(filters.minPrice) : '');
    setMaxText(filters.maxPrice ? String(filters.maxPrice) : '');
  };

  const minPrice = toAmount(minText);
  const maxPrice = toAmount(maxText);
  const priceError = minPrice !== null && maxPrice !== null && minPrice > maxPrice;

  const apply = () => {
    if (priceError) return;
    onApply({ ...draft, minPrice, maxPrice, size: (draft.size ?? '').trim() });
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: theme.backgroundElement,
      color: theme.text,
      textAlign: direction === 'rtl' ? 'right' : 'left',
    } as const,
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={page === 'wilaya' ? () => setPage('main') : onClose}
      onShow={() => {
        setPage('main');
        reset(applied);
      }}>
      {/* A Modal opens outside the main screen, so set the direction again here. */}
      <KeyboardAvoidingView
        style={[styles.backdrop, { direction }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdropTap} onPress={onClose} accessibilityLabel={t('auth.close')} />
        <ThemedView style={styles.sheet}>
          <SafeAreaView edges={['bottom']} style={styles.flex}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: theme.backgroundSelected }]}>
              {page === 'wilaya' ? (
                <Pressable
                  onPress={() => setPage('main')}
                  accessibilityRole="button"
                  accessibilityLabel={t('search.back')}
                  hitSlop={8}>
                  <Ionicons
                    name={direction === 'rtl' ? 'arrow-forward' : 'arrow-back'}
                    size={24}
                    color={theme.text}
                  />
                </Pressable>
              ) : (
                <View style={styles.headerSide} />
              )}
              <ThemedText type="smallBold" style={styles.headerTitle}>
                {page === 'wilaya' ? t('search.wilaya') : t('search.filtersTitle')}
              </ThemedText>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={t('auth.close')}
                hitSlop={8}>
                <Ionicons name="close" size={24} color={theme.text} />
              </Pressable>
            </View>

            {page === 'wilaya' ? (
              <View style={[styles.flex, styles.wilayaPage]}>
                <WilayaList
                  value={draft.wilaya ?? null}
                  allLabel={t('search.allWilayas')}
                  onSelect={(code) => {
                    setDraft({ ...draft, wilaya: code });
                    setPage('main');
                  }}
                />
              </View>
            ) : (
              <>
                <ScrollView
                  style={styles.flex}
                  contentContainerStyle={styles.content}
                  keyboardShouldPersistTaps="handled">
                  <Section title={t('search.category')}>
                    <View style={styles.options}>
                      <OptionChip
                        label={t('search.allCategories')}
                        selected={!draft.category}
                        onPress={() => setDraft({ ...draft, category: null })}
                      />
                      {mainCategoriesInOrder(categories).map((c) => (
                        <OptionChip
                          key={c.id}
                          label={categoryName(c, language)}
                          selected={draft.category === c.id}
                          onPress={() => setDraft({ ...draft, category: c.id })}
                        />
                      ))}
                    </View>
                  </Section>

                  <Section title={t('search.wilaya')}>
                    <Pressable
                      onPress={() => setPage('wilaya')}
                      accessibilityRole="button"
                      style={[styles.selectRow, { backgroundColor: theme.backgroundElement }]}>
                      <ThemedText
                        themeColor={draft.wilaya ? 'text' : 'textSecondary'}
                        style={styles.flex}>
                        {draft.wilaya
                          ? wilayaLabel(draft.wilaya, language)
                          : t('search.allWilayas')}
                      </ThemedText>
                      <Ionicons
                        name={direction === 'rtl' ? 'chevron-back' : 'chevron-forward'}
                        size={18}
                        color={theme.textSecondary}
                      />
                    </Pressable>
                  </Section>

                  <Section title={t('search.price')}>
                    <View style={styles.priceRow}>
                      <View style={styles.flex}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {t('search.min')}
                        </ThemedText>
                        <TextInput
                          value={minText}
                          onChangeText={(text) => setMinText(onlyDigits(text))}
                          keyboardType="number-pad"
                          placeholder="0"
                          placeholderTextColor={theme.textSecondary}
                          accessibilityLabel={t('search.min')}
                          maxLength={9}
                          style={inputStyle}
                        />
                      </View>
                      <View style={styles.flex}>
                        <ThemedText type="small" themeColor="textSecondary">
                          {t('search.max')}
                        </ThemedText>
                        <TextInput
                          value={maxText}
                          onChangeText={(text) => setMaxText(onlyDigits(text))}
                          keyboardType="number-pad"
                          placeholder="—"
                          placeholderTextColor={theme.textSecondary}
                          accessibilityLabel={t('search.max')}
                          maxLength={9}
                          style={inputStyle}
                        />
                      </View>
                    </View>
                    {priceError ? (
                      <ThemedText themeColor="danger" type="small" style={styles.error}>
                        {t('search.priceError')}
                      </ThemedText>
                    ) : null}
                  </Section>

                  <Section title={t('search.size')}>
                    <TextInput
                      value={draft.size ?? ''}
                      onChangeText={(size) => setDraft({ ...draft, size })}
                      placeholder={t('search.sizePlaceholder')}
                      placeholderTextColor={theme.textSecondary}
                      accessibilityLabel={t('search.size')}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={20}
                      style={inputStyle}
                    />
                  </Section>

                  <Section title={t('search.condition')}>
                    <View style={styles.options}>
                      <OptionChip
                        label={t('search.anyCondition')}
                        selected={!draft.condition}
                        onPress={() => setDraft({ ...draft, condition: null })}
                      />
                      {CONDITIONS.map((condition) => (
                        <OptionChip
                          key={condition}
                          label={t(`listing.conditions.${condition}`)}
                          selected={draft.condition === condition}
                          onPress={() => setDraft({ ...draft, condition })}
                        />
                      ))}
                    </View>
                  </Section>
                </ScrollView>

                {/* Footer */}
                <View style={[styles.footer, { borderTopColor: theme.backgroundSelected }]}>
                  <View style={styles.flex}>
                    <PrimaryButton
                      title={t('search.clearAll')}
                      variant="secondary"
                      onPress={() => reset(NO_FILTERS)}
                    />
                  </View>
                  <View style={styles.flex}>
                    <PrimaryButton title={t('search.apply')} onPress={apply} />
                  </View>
                </View>
              </>
            )}
          </SafeAreaView>
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  backdropTap: { flexGrow: 1, minHeight: 40 },
  sheet: {
    height: '88%',
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: { width: 24 },
  headerTitle: { fontSize: 18 },
  wilayaPage: { paddingTop: Spacing.two },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  section: { gap: Spacing.two },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  option: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: 999 },
  optionTextSelected: { color: '#ffffff' },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
  },
  priceRow: { flexDirection: 'row', gap: Spacing.three },
  input: {
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    fontSize: 16,
  },
  error: {},
  footer: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
