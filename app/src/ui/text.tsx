import { Text, type TextProps } from 'react-native';

import { useLanguage } from '@/i18n/language-provider';
import { hasArabic, textStyleFor, useTokens, type Colors, type TextVariant } from '@/theme';

export type Tone = 'default' | 'secondary' | 'muted' | 'primary' | 'onPrimary' | 'success' | 'warning' | 'danger';

const TONE_COLOR: Record<Tone, keyof Colors> = {
  default: 'text',
  secondary: 'textSecondary',
  muted: 'textMuted',
  primary: 'primary',
  onPrimary: 'onPrimary',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

type Props = TextProps & {
  /** display/title/subtitle/price use Fraunces; the others DM Sans. */
  variant?: TextVariant;
  tone?: Tone;
  /** 'start' (default: left in French, right in Arabic), 'center' or 'end'. */
  align?: 'start' | 'center' | 'end';
};

/**
 * Text in the app's fonts, sizes and colours. Lines up right-to-left in Arabic.
 * Arabic (the app in Arabic, or Arabic words like "سوقنا") uses Noto Naskh Arabic.
 */
export function AppText({ variant = 'body', tone = 'default', align = 'start', style, ...rest }: Props) {
  const tk = useTokens();
  const { direction, language } = useLanguage();
  const rtl = direction === 'rtl';
  const arabic = language === 'ar' || hasArabic(rest.children);
  const textAlign =
    align === 'center' ? 'center' : (align === 'start') !== rtl ? 'left' : 'right';
  return (
    <Text
      style={[
        textStyleFor(variant, arabic),
        { color: tk.color[TONE_COLOR[tone]], textAlign, writingDirection: direction },
        style,
      ]}
      {...rest}
    />
  );
}
