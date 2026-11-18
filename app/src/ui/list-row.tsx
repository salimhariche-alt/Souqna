import Ionicons from '@expo/vector-icons/Ionicons';
import { Children, type ComponentProps, Fragment, type PropsWithChildren, isValidElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLanguage } from '@/i18n/language-provider';
import { FontFiles, type TintKey, useTokens } from '@/theme';

import { ArchFrame } from './arch';
import { DesignIcon, type DesignIconName } from './icons';

type Props = {
  label: string;
  /** The design's own icon (preferred)... */
  designIcon?: DesignIconName;
  /** ...or an Ionicons icon. */
  icon?: ComponentProps<typeof Ionicons>['name'];
  /** The soft colour of the small arch behind the icon (default: clay). */
  tint?: TintKey;
  /** e.g. "Français" next to "Langue", or a count ("8"). */
  value?: string;
  /** A second, smaller line under the label. */
  description?: string;
  onPress?: () => void;
  /** The ">" at the end. Shown by default when the row can be tapped. */
  arrow?: boolean;
  danger?: boolean;
};

/**
 * A row, exactly as in profile.html: the icon in a 36 x 40 arch (soft tint), the label
 * (15px), an optional grey value (14px) and a light ">" ("<" in Arabic). At least 56
 * high. Put rows in a <ListGroup> (one cream card with thin lines between rows).
 */
export function ListRow({
  label,
  designIcon,
  icon,
  tint = 'tint1',
  value,
  description,
  onPress,
  arrow,
  danger = false,
}: Props) {
  const tk = useTokens();
  const { direction, language } = useLanguage();
  const showArrow = arrow ?? Boolean(onPress);
  const color = danger ? tk.color.danger : tk.color.text;
  const iconColor = danger ? tk.color.danger : tk.brand.ink;
  const font = (latin: string, arabic: string) => (language === 'ar' ? arabic : latin);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: tk.color.surfaceAlt }]}>
      {designIcon || icon ? (
        <ArchFrame width={36} height={40} color={danger ? tk.color.dangerSoft : tk.color[tint]} bottomRadius={8}>
          <View style={styles.center}>
            {designIcon ? (
              <DesignIcon name={designIcon} size={17} color={iconColor} strokeWidth={1.7} />
            ) : (
              <Ionicons name={icon} size={17} color={iconColor} />
            )}
          </View>
        </ArchFrame>
      ) : null}
      <View style={styles.flex}>
        <Text
          style={[styles.label, { color, fontFamily: font(FontFiles.regular, FontFiles.arabic) }]}
          numberOfLines={2}>
          {label}
        </Text>
        {description ? (
          <Text
            style={[styles.description, { color: tk.color.textSecondary, fontFamily: font(FontFiles.regular, FontFiles.arabic) }]}
            numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text
          style={[styles.value, { color: tk.color.textSecondary, fontFamily: font(FontFiles.regular, FontFiles.arabic) }]}
          numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {showArrow ? (
        <DesignIcon
          name={direction === 'rtl' ? 'chevronLeft' : 'chevronRight'}
          size={16}
          color={tk.color.iconMuted}
          strokeWidth={1.9}
        />
      ) : null}
    </Pressable>
  );
}

/** Rows in one cream card (border, corners 20), with thin lines between them. */
export function ListGroup({ children }: PropsWithChildren) {
  const tk = useTokens();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, { backgroundColor: tk.color.surface, borderColor: tk.color.border }]}>
      {rows.map((row, i) => (
        <Fragment key={row.key ?? i}>
          {i > 0 && <View style={[styles.divider, { backgroundColor: tk.color.divider }]} />}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  label: { fontSize: 15, lineHeight: 21 },
  description: { fontSize: 13, lineHeight: 18 },
  value: { fontSize: 14, lineHeight: 20, maxWidth: '40%' },
  group: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  divider: { height: 1 },
});
