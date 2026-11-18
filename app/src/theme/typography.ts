/**
 * The app's fonts - "Warm & Local" design (all free, SIL Open Font License):
 *   - Fraunces 600/700: titles and prices (a warm serif);
 *   - DM Sans 400/500/700: everything else;
 *   - Noto Naskh Arabic 500/700: ALL Arabic text (the two fonts above have no Arabic).
 *
 * Android can't make a custom font bold by itself, so each weight is its own file and
 * styles choose the file (fontFamily), not fontWeight.
 *
 * Arabic: <AppText> (src/ui/text.tsx) uses ArabicTextStyles when the app is in Arabic
 * OR when the text itself contains Arabic letters (e.g. "سوقنا" next to a French title).
 */
import type { TextStyle } from 'react-native';

export const FontFiles = {
  // DM Sans (the keys regular/medium/semibold/bold are used all over the app).
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_700Bold', // DM Sans comes in 400/500/700: "semibold" uses 700
  bold: 'DMSans_700Bold',
  // Fraunces: titles and prices.
  serifSemibold: 'Fraunces_600SemiBold',
  serifBold: 'Fraunces_700Bold',
  // Noto Naskh Arabic: all Arabic text.
  arabic: 'NotoNaskhArabic_500Medium',
  arabicBold: 'NotoNaskhArabic_700Bold',
} as const;

/** Loaded once when the app starts (see app/_layout.tsx). */
export const FONT_ASSETS = {
  [FontFiles.regular]: require('@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf'),
  [FontFiles.medium]: require('@expo-google-fonts/dm-sans/500Medium/DMSans_500Medium.ttf'),
  [FontFiles.bold]: require('@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf'),
  [FontFiles.serifSemibold]: require('@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf'),
  [FontFiles.serifBold]: require('@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf'),
  [FontFiles.arabic]: require('@expo-google-fonts/noto-naskh-arabic/500Medium/NotoNaskhArabic_500Medium.ttf'),
  [FontFiles.arabicBold]: require('@expo-google-fonts/noto-naskh-arabic/700Bold/NotoNaskhArabic_700Bold.ttf'),
};

/** The text sizes (French / English). Line heights about 1.3x for titles, 1.5x for text. */
export const TextStyles = {
  /** Big screen titles: "Le souk de chez nous" (welcome.html: 30px, line-height 1.1, -0.6px) */
  display: { fontFamily: FontFiles.serifBold, fontSize: 30, lineHeight: 33, letterSpacing: -0.6 },
  /** Screen and sheet titles: "Mon profil" */
  title: { fontFamily: FontFiles.serifBold, fontSize: 24, lineHeight: 32 },
  /** Section titles: "Près de chez vous" */
  subtitle: { fontFamily: FontFiles.serifSemibold, fontSize: 20, lineHeight: 28 },
  /** Prices: "3 500 DA" */
  price: { fontFamily: FontFiles.serifBold, fontSize: 18, lineHeight: 24 },
  /** Normal text */
  body: { fontFamily: FontFiles.regular, fontSize: 16, lineHeight: 24 },
  /** Normal text that should stand out (labels, names, button text) */
  bodyStrong: { fontFamily: FontFiles.bold, fontSize: 16, lineHeight: 24 },
  /** Secondary text: wilaya, dates, hints */
  small: { fontFamily: FontFiles.regular, fontSize: 14, lineHeight: 20 },
  smallStrong: { fontFamily: FontFiles.medium, fontSize: 14, lineHeight: 20 },
  /** Tiny text: badges, tab labels, photo counters */
  caption: { fontFamily: FontFiles.medium, fontSize: 12, lineHeight: 16 },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof TextStyles;

/** The same sizes for Arabic (Noto Naskh Arabic, which needs taller lines). */
export const ArabicTextStyles: Record<TextVariant, TextStyle> = {
  display: { fontFamily: FontFiles.arabicBold, fontSize: 28, lineHeight: 46 },
  title: { fontFamily: FontFiles.arabicBold, fontSize: 22, lineHeight: 38 },
  subtitle: { fontFamily: FontFiles.arabicBold, fontSize: 19, lineHeight: 32 },
  price: { fontFamily: FontFiles.arabicBold, fontSize: 18, lineHeight: 30 },
  body: { fontFamily: FontFiles.arabic, fontSize: 16, lineHeight: 28 },
  bodyStrong: { fontFamily: FontFiles.arabicBold, fontSize: 16, lineHeight: 28 },
  small: { fontFamily: FontFiles.arabic, fontSize: 14, lineHeight: 24 },
  smallStrong: { fontFamily: FontFiles.arabicBold, fontSize: 14, lineHeight: 24 },
  caption: { fontFamily: FontFiles.arabic, fontSize: 12, lineHeight: 20 },
};

const ARABIC_LETTERS = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** Does this text contain Arabic letters? */
export function hasArabic(text: unknown): boolean {
  if (typeof text === 'string') return ARABIC_LETTERS.test(text);
  if (Array.isArray(text)) return text.some(hasArabic);
  return false;
}

/** The style for a text: Arabic font if the app is in Arabic or the text is Arabic. */
export function textStyleFor(variant: TextVariant, arabic: boolean): TextStyle {
  return arabic ? ArabicTextStyles[variant] : TextStyles[variant];
}
