/**
 * The app's font: IBM Plex Sans Arabic (free, SIL Open Font License). It was designed
 * for Arabic AND Latin together, so French, English and Arabic look like one family.
 *
 * Android can't make a custom font bold by itself, so each weight is its own file
 * and styles choose the file (fontFamily), not fontWeight.
 */
import type { TextStyle } from 'react-native';

export const FontFiles = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semibold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
} as const;

/** Loaded once when the app starts (see app/_layout.tsx). */
export const FONT_ASSETS = {
  [FontFiles.regular]: require('@expo-google-fonts/ibm-plex-sans-arabic/400Regular/IBMPlexSansArabic_400Regular.ttf'),
  [FontFiles.medium]: require('@expo-google-fonts/ibm-plex-sans-arabic/500Medium/IBMPlexSansArabic_500Medium.ttf'),
  [FontFiles.semibold]: require('@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold/IBMPlexSansArabic_600SemiBold.ttf'),
  [FontFiles.bold]: require('@expo-google-fonts/ibm-plex-sans-arabic/700Bold/IBMPlexSansArabic_700Bold.ttf'),
};

/**
 * The text sizes. Line heights are about 1.5x the size: Arabic letters are taller than
 * Latin ones and need the room.
 */
export const TextStyles = {
  /** Big screen titles: "Bienvenue sur Souqna" */
  display: { fontFamily: FontFiles.bold, fontSize: 28, lineHeight: 40 },
  /** Screen and sheet titles */
  title: { fontFamily: FontFiles.bold, fontSize: 22, lineHeight: 32 },
  /** Section titles, prices on a listing page */
  subtitle: { fontFamily: FontFiles.semibold, fontSize: 18, lineHeight: 28 },
  /** Normal text */
  body: { fontFamily: FontFiles.regular, fontSize: 16, lineHeight: 24 },
  /** Normal text that should stand out (labels, names, button text) */
  bodyStrong: { fontFamily: FontFiles.semibold, fontSize: 16, lineHeight: 24 },
  /** Secondary text: wilaya, dates, hints */
  small: { fontFamily: FontFiles.regular, fontSize: 14, lineHeight: 21 },
  smallStrong: { fontFamily: FontFiles.semibold, fontSize: 14, lineHeight: 21 },
  /** Tiny text: badges, photo counters */
  caption: { fontFamily: FontFiles.medium, fontSize: 12, lineHeight: 18 },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof TextStyles;
