/**
 * Souqna's design system: EVERY colour, size, spacing and corner radius lives here.
 * Screens and building blocks (src/ui/) read them with useTokens() - never write a
 * colour like "#17784A" directly in a screen.
 *
 * Light and dark mode follow the phone's setting.
 */

// Brand colour --------------------------------------------------------------------------
// Three options to choose from (see the "Design preview" screen). Each one has:
//   primary        buttons, links, selected things
//   primaryPressed when a button is pressed
//   primarySoft    light background behind brand-coloured things (selected chips...)
//   onPrimary      text/icons on top of `primary`
// All pass the WCAG AA contrast rule (4.5:1) for text on the primary colour.

export type BrandColors = {
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
};

export type BrandId = 'current' | 'atlas' | 'terracotta' | 'safran';

export const BRANDS: Record<
  BrandId,
  { name: string; description: string; light: BrandColors; dark: BrandColors }
> = {
  // The blue the app uses today, kept until a brand colour is chosen.
  current: {
    name: 'Current blue',
    description: "The app's colour today (Expo's starter blue).",
    light: { primary: '#1F7BD6', primaryPressed: '#1865B0', primarySoft: '#E4F0FC', onPrimary: '#FFFFFF' },
    dark: { primary: '#6CB2F7', primaryPressed: '#559FE8', primarySoft: 'rgba(108,178,247,0.16)', onPrimary: '#06223D' },
  },
  atlas: {
    name: 'A · Vert Atlas',
    description: 'A deep green like the Atlas forests and the flag: calm and trustworthy.',
    light: { primary: '#17784A', primaryPressed: '#11603A', primarySoft: '#E3F3EA', onPrimary: '#FFFFFF' },
    dark: { primary: '#5FD39A', primaryPressed: '#4BB884', primarySoft: 'rgba(95,211,154,0.16)', onPrimary: '#0B2A1C' },
  },
  terracotta: {
    name: 'B · Terracotta',
    description: 'The warm earth of Ghardaïa and clay pottery: friendly and local.',
    light: { primary: '#B64A28', primaryPressed: '#963B1F', primarySoft: '#FBE9E2', onPrimary: '#FFFFFF' },
    dark: { primary: '#FF9B76', primaryPressed: '#F08560', primarySoft: 'rgba(255,155,118,0.16)', onPrimary: '#3A1408' },
  },
  safran: {
    name: 'C · Safran du Sahara',
    description: 'A saffron / desert ochre: sunny and energetic, like a souk.',
    light: { primary: '#9A5B00', primaryPressed: '#7C4900', primarySoft: '#FCF0DC', onPrimary: '#FFFFFF' },
    dark: { primary: '#F2B33D', primaryPressed: '#E0A12B', primarySoft: 'rgba(242,179,61,0.16)', onPrimary: '#2E1D00' },
  },
};

/**
 * THE BRAND COLOUR OF THE APP. Changing this one line re-colours everything built with
 * the design system. Chosen by the owner: A · Vert Atlas.
 */
export const CHOSEN_BRAND: BrandId = 'atlas';

// Neutral colours (warm greys, so the brand colour feels at home) -------------------------

export type NeutralColors = {
  background: string; // the screen
  surface: string; // cards, text fields, list rows
  surfaceAlt: string; // pressed rows, chips, placeholders behind photos
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  overlay: string; // behind sheets and dialogs
};

export const NEUTRALS: { light: NeutralColors; dark: NeutralColors } = {
  light: {
    background: '#FFFFFF',
    surface: '#F7F6F3',
    surfaceAlt: '#EDEBE6',
    border: '#E2DFD8',
    text: '#1C1B19',
    textSecondary: '#5E5A53',
    textMuted: '#8B867D',
    overlay: 'rgba(0,0,0,0.45)',
  },
  dark: {
    background: '#141311',
    surface: '#1F1E1B',
    surfaceAlt: '#2B2A26',
    border: '#38362F',
    text: '#F5F3EE',
    textSecondary: '#BAB5AB',
    textMuted: '#8A857C',
    overlay: 'rgba(0,0,0,0.6)',
  },
};

// Status colours (the same whatever the brand) ------------------------------------------

export type StatusColors = {
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
};

export const STATUS: { light: StatusColors; dark: StatusColors } = {
  light: {
    success: '#1E7F3A',
    successSoft: '#E5F4EA',
    warning: '#9A5A00',
    warningSoft: '#FFF2DB',
    danger: '#C42B2B',
    dangerSoft: '#FCE8E8',
    info: '#1A6BC7',
    infoSoft: '#E5F0FB',
  },
  dark: {
    success: '#6FD08C',
    successSoft: 'rgba(111,208,140,0.15)',
    warning: '#F5B65A',
    warningSoft: 'rgba(245,182,90,0.15)',
    danger: '#FF8A80',
    dangerSoft: 'rgba(255,138,128,0.15)',
    info: '#8AB8F5',
    infoSoft: 'rgba(138,184,245,0.15)',
  },
};

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

/** Rounded corners. */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

/** The tallest a screen's content gets on a tablet or a computer. */
export const MaxWidth = 720;

/** Tap targets are at least this tall (Apple and Google recommend 44-48). */
export const MinTouch = 48;
