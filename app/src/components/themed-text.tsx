import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FontFiles } from '@/theme/typography';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  const color = theme[themeColor ?? (type === 'linkPrimary' ? 'primary' : 'text')];
  return <Text style={[{ color }, styles[type], style]} {...rest} />;
}

// The app's font (see src/theme/typography.ts): one file per weight.
const styles = StyleSheet.create({
  small: {
    fontFamily: FontFiles.medium,
    fontSize: 14,
    lineHeight: 21,
  },
  smallBold: {
    fontFamily: FontFiles.bold,
    fontSize: 14,
    lineHeight: 21,
  },
  default: {
    fontFamily: FontFiles.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontFamily: FontFiles.semibold,
    fontSize: 48,
    lineHeight: 60,
  },
  subtitle: {
    fontFamily: FontFiles.semibold,
    fontSize: 32,
    lineHeight: 46,
  },
  link: {
    fontFamily: FontFiles.regular,
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    fontFamily: FontFiles.regular,
    lineHeight: 30,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
