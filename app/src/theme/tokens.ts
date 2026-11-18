/**
 * Sougna's design system - "Warm & Local": EVERY colour, size, spacing and corner radius
 * lives here. Screens and building blocks (src/ui/) read them with useTokens() - never
 * write a colour like "#B4472A" directly in a screen.
 *
 * Light and dark mode follow the phone's setting. Every text colour below was checked
 * against the backgrounds it is used on: at least 4.5:1 (WCAG AA). Two combinations to
 * AVOID because they are under 4.5:1: `primary` or `success` TEXT on `chip` / tints
 * (use `text`/`textSecondary` there, or white text on a `primary` fill).
 */

export type Colors = {
  // Surfaces
  background: string; // the screen: sand
  surface: string; // cards, text fields, list rows, the tab bar
  surfaceAlt: string; // pressed rows, image placeholders
  chip: string; // chips (filters, "Taille M", "Oran")
  border: string;
  borderStrong: string; // text fields, outlined buttons
  divider: string; // lines between rows inside a card (#EFE4D4)
  iconMuted: string; // the light ">" at the end of rows (#9C8B7C) - icons only, not text
  overlay: string; // behind sheets and dialogs
  // Text
  text: string;
  textSecondary: string;
  textMuted: string; // only on background/surface (not on chips or tints)
  textBody: string; // long text: descriptions, tips (#4A3B30 in the design)
  // Brand: terracotta
  primary: string; // buttons, prices, active tab, links
  primaryPressed: string;
  primarySoft: string; // light background behind terracotta text
  onPrimary: string; // text/icons on `primary`
  // Accents
  saffron: string;
  casbah: string; // Casbah blue
  olive: string;
  // Soft tints: image placeholders, category tiles, list-row icons, avatars
  tint1: string; // clay
  tint2: string; // sky
  tint3: string; // wheat
  tint4: string; // sage
  tint5: string; // rose
  tint6: string; // stone (#E6DED3)
  tintIcon: string; // icons drawn on a tint (e.g. the bag on an empty photo)
  // Status
  success: string; // olive: "Téléphone vérifié"
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string; // log out, delete, errors
  dangerSoft: string;
  info: string;
  infoSoft: string;
};

export const COLORS: { light: Colors; dark: Colors } = {
  light: {
    background: '#F6EFE4',
    surface: '#FFFBF5',
    surfaceAlt: '#F0E6D8',
    chip: '#EAD8C2',
    border: '#E6D9C6',
    borderStrong: '#D8C6AE',
    divider: '#EFE4D4',
    iconMuted: '#9C8B7C',
    overlay: 'rgba(43,29,20,0.45)',
    text: '#2B1D14', // 14.3:1 on sand
    textSecondary: '#6B5A4C', // 5.8:1 on sand, 4.7:1 on chips
    textMuted: '#7A6858', // 4.7:1 on sand, 5.2:1 on cards
    textBody: '#4A3B30', // 9.5:1 on sand
    primary: '#B4472A', // white on it 5.4:1; as text 4.7:1 on sand
    primaryPressed: '#9A3B22',
    primarySoft: '#FAEDE6',
    onPrimary: '#FFFFFF',
    saffron: '#E3A63A',
    casbah: '#1F4E8C',
    olive: '#5C6B33',
    tint1: '#F0D9C4',
    tint2: '#D9E3EE',
    tint3: '#EBDDB3',
    tint4: '#DDE3CC',
    tint5: '#E8D6D0',
    tint6: '#E6DED3',
    tintIcon: '#5A4636',
    success: '#5C6B33', // 5.1:1 on sand, 4.9:1 on successSoft
    successSoft: '#E9EDDC',
    warning: '#8A5A0B',
    warningSoft: '#F8EBCF',
    danger: '#9A3A20', // 6.1:1 on sand
    dangerSoft: '#F6E1D8',
    info: '#1F4E8C',
    infoSoft: '#E3EAF3',
  },
  // Warm dark: dark brown backgrounds, sand text, a lighter terracotta.
  dark: {
    background: '#1E1611',
    surface: '#2A201A',
    surfaceAlt: '#352920',
    chip: '#3D2E24',
    border: '#3E3027',
    borderStrong: '#564435',
    divider: '#352920',
    iconMuted: '#8F7A67',
    overlay: 'rgba(0,0,0,0.6)',
    text: '#F3E8D8', // 14.7:1
    textSecondary: '#CDB9A4', // 9.4:1, 6.9:1 on chips
    textMuted: '#AE9883', // 6.5:1 on background, 5.8:1 on cards
    textBody: '#E3D5C3',
    primary: '#EE8A68', // 7.2:1 as text; dark text on it 7.2:1
    primaryPressed: '#DB7553',
    primarySoft: 'rgba(238,138,104,0.16)',
    onPrimary: '#2A1108',
    saffron: '#F0BC5E',
    casbah: '#9DBDEB',
    olive: '#B9C783',
    tint1: '#4A3328',
    tint2: '#2C3848',
    tint3: '#463D24',
    tint4: '#363D2A',
    tint5: '#47332F',
    tint6: '#3E3730',
    tintIcon: '#E6D3BE',
    success: '#B9C783',
    successSoft: 'rgba(185,199,131,0.16)',
    warning: '#F0BE62',
    warningSoft: 'rgba(240,190,98,0.16)',
    danger: '#F4A28A',
    dangerSoft: 'rgba(244,162,138,0.16)',
    info: '#9DBDEB',
    infoSoft: 'rgba(157,189,235,0.16)',
  },
};

/**
 * Light or dark for the whole app. 'light' = always "Clair" (the owner's choice, also when
 * the phone is in dark mode); 'dark' = always "Sombre"; 'phone' = follow the phone.
 * The dark colours above stay ready for later. (Also set "userInterfaceStyle" in app.json:
 * "light" / "dark" / "automatic" to match.)
 */
export const APP_COLOR_MODE: 'light' | 'dark' | 'phone' = 'light';

/** The 5 soft tints, in order (e.g. a different tint for each category tile). */
export const TINTS = ['tint1', 'tint2', 'tint3', 'tint4', 'tint5'] as const;
export type TintKey = (typeof TINTS)[number] | 'tint6';

/**
 * Brand colours that must look the same in light AND dark mode: the Welcome arch,
 * the triangle band, the round "+" and the app icon.
 */
export const BrandPalette = {
  terracotta: '#B4472A',
  saffron: '#E3A63A',
  casbah: '#1F4E8C',
  olive: '#5C6B33',
  sand: '#F6EFE4',
  cream: '#FFFBF5',
  ink: '#2B1D14',
  inkSoft: '#6B5A4C',
  clay: '#F0D9C4',
  wheat: '#EBDDB3',
  white: '#FFFFFF',
} as const;

// Sizes ------------------------------------------------------------------------------------

/** Space between things. Generous: most gaps are 12-24. */
export const Space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Rounded corners: buttons and fields 16, cards 20, chips and badges `full` (pill). */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 999,
} as const;

/** The tallest a screen's content gets on a tablet or a computer. */
export const MaxWidth = 720;

/** Tap targets are at least this tall (Apple and Google recommend 44-48). */
export const MinTouch = 48;

/** Main buttons ("Créer un compte", "Contacter Amina"). */
export const ButtonHeight = 54;
