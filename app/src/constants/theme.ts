/**
 * Colours for the screens written before the design system (they use useTheme()).
 * They now come from the design system (src/theme/tokens.ts), so the whole app shares
 * one palette in light and dark mode. New code: use useTokens() from '@/theme' and the
 * building blocks in '@/ui' instead.
 */

import '@/global.css';

import { Platform } from 'react-native';

import { BrandPalette, colorsFor } from '@/theme';

function legacy(scheme: 'light' | 'dark') {
  const c = colorsFor(scheme);
  return {
    text: c.text,
    background: c.background,
    backgroundElement: c.surface,
    backgroundSelected: c.surfaceAlt,
    textSecondary: c.textSecondary,
    // Brand and status colours, so older screens can follow light/dark mode too.
    primary: c.primary,
    primarySoft: c.primarySoft,
    onPrimary: c.onPrimary,
    border: c.border,
    danger: c.danger,
    success: c.success,
    warning: c.warning,
  };
}

export const Colors = { light: legacy('light'), dark: legacy('dark') };

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * The brand colour for FILLS, borders and icons (buttons, selected chips, bubbles).
 * Terracotta, readable in both light and dark mode (white text on it: 5.4:1).
 * For brand-coloured TEXT use the theme's `primary` (lighter in dark mode) instead.
 */
export const Brand = {
  fill: BrandPalette.terracotta,
  onFill: BrandPalette.white,
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
