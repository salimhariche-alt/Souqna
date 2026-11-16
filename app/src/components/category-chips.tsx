import { type ComponentRef, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { Category } from '@/api/listings';
import { categoryName } from '@/hooks/use-categories';
import { useLanguage } from '@/i18n/language-provider';
import { useTokens } from '@/theme';
import { AppText } from '@/ui';

// The order asked for in the design; any other main category comes after these.
const ORDER = ['Women', 'Men', 'Kids', 'Home', 'Electronics'];

export function mainCategoriesInOrder(categories: Category[]): Category[] {
  const rank = (c: Category) => {
    const index = ORDER.indexOf(c.name_en);
    return index === -1 ? ORDER.length : index;
  };
  return categories.filter((c) => c.parent === null).sort((a, b) => rank(a) - rank(b));
}

type Props = {
  categories: Category[];
  selected: number | null;
  onSelect: (categoryId: number | null) => void;
};

/** A scrollable row: All, Women, Men, Kids, Home, Electronics (in the chosen language). */
export function CategoryChips({ categories, selected, onSelect }: Props) {
  const { t } = useTranslation();
  const { language, direction } = useLanguage();
  const tk = useTokens();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const chips: { id: number | null; label: string }[] = [
    { id: null, label: t('home.allCategories') },
    ...categories.map((c) => ({ id: c.id, label: categoryName(c, language) })),
  ];

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      // Phone scroll views always start at the left edge. In Arabic the first chip
      // ("All") sits on the right, so start the row scrolled to the right end.
      // (Web browsers already do this by themselves for right-to-left pages.)
      onContentSizeChange={() => {
        if (direction === 'rtl' && Platform.OS !== 'web') {
          scrollRef.current?.scrollToEnd({ animated: false });
        }
      }}>
      {chips.map((chip) => {
        const isSelected = chip.id === selected;
        return (
          <Pressable
            key={chip.id ?? 'all'}
            onPress={() => onSelect(chip.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            style={({ pressed }) => [
              styles.chip,
              {
                borderRadius: tk.radius.full,
                backgroundColor: isSelected ? tk.color.primary : pressed ? tk.color.surfaceAlt : tk.color.surface,
              },
            ]}>
            <AppText variant="smallStrong" style={{ color: isSelected ? tk.color.onPrimary : tk.color.text }}>
              {chip.label}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, minHeight: 38, justifyContent: 'center' },
});
