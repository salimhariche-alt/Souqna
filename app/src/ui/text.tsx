import { Text, type TextProps } from 'react-native';

import { useLanguage } from '@/i18n/language-provider';
import { useTokens, type Colors, type TextVariant } from '@/theme';

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
  variant?: TextVariant;
  tone?: Tone;
  /** 'start' (default: left in French, right in Arabic), 'center' or 'end'. */
  align?: 'start' | 'center' | 'end';
};

/** Text in the app's font, size and colours. Lines up right-to-left in Arabic. */
export function AppText({ variant = 'body', tone = 'default', align = 'start', style, ...rest }: Props) {
  const tk = useTokens();
  const { direction } = useLanguage();
  const rtl = direction === 'rtl';
  const textAlign =
    align === 'center' ? 'center' : (align === 'start') !== rtl ? 'left' : 'right';
  return (
    <Text
      style={[tk.text[variant], { color: tk.color[TONE_COLOR[tone]], textAlign, writingDirection: direction }, style]}
      {...rest}
    />
  );
}
