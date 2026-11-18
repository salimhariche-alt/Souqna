import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/i18n/language-provider';
import { FontFiles, hasArabic } from '@/theme/typography';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

/**
 * Text for the older screens, in the "Warm & Local" fonts: titles in Fraunces, the rest
 * in DM Sans - and everything in Noto Naskh Arabic when the app is in Arabic (or the
 * text itself is Arabic). New code: use <AppText> from '@/ui'.
 */
export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const { language } = useLanguage();
  const arabic = language === 'ar' || hasArabic(rest.children);
  const color = theme[themeColor ?? (type === 'linkPrimary' ? 'primary' : 'text')];
  return <Text style={[{ color }, styles[type], arabic && arabicStyles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  small: { fontFamily: FontFiles.regular, fontSize: 14, lineHeight: 20 },
  smallBold: { fontFamily: FontFiles.bold, fontSize: 14, lineHeight: 20 },
  default: { fontFamily: FontFiles.regular, fontSize: 16, lineHeight: 24 },
  title: { fontFamily: FontFiles.serifBold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  subtitle: { fontFamily: FontFiles.serifBold, fontSize: 22, lineHeight: 28 },
  link: { fontFamily: FontFiles.regular, lineHeight: 30, fontSize: 14 },
  linkPrimary: { fontFamily: FontFiles.bold, lineHeight: 30, fontSize: 14 },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});

/** The same sizes in Noto Naskh Arabic (taller lines). */
const arabicStyles = StyleSheet.create({
  small: { fontFamily: FontFiles.arabic, lineHeight: 24 },
  smallBold: { fontFamily: FontFiles.arabicBold, lineHeight: 24 },
  default: { fontFamily: FontFiles.arabic, lineHeight: 28 },
  title: { fontFamily: FontFiles.arabicBold, fontSize: 28, lineHeight: 46, letterSpacing: 0 },
  subtitle: { fontFamily: FontFiles.arabicBold, fontSize: 21, lineHeight: 34 },
  link: { fontFamily: FontFiles.arabic },
  linkPrimary: { fontFamily: FontFiles.arabicBold },
  code: {},
});
