import Svg, { Path } from 'react-native-svg';

/**
 * Line icons copied from the "Warm & Local" design files (docs/inspiration/warm-local/):
 * same SVG paths, drawn in a 24 x 24 box. Add new ones here with the exact path.
 */
export const ICON_PATHS = {
  /** Small "v" on the language button. */
  chevronDown: 'M6 9l6 6 6-6',
  /** Vase / carafe (Welcome, empty photo). */
  vase: 'M9 3h6l-1 5 4 13H6l4-13z',
  /** Shopping bag (Welcome, empty photo) - also the "pot" of home.html. */
  bag: 'M6 9h12l-1 10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z M9 9V7a3 3 0 0 1 6 0v2 M4 9h16',
  // home.html
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 21h4',
  search: 'M11 4a7 7 0 1 1 0 14a7 7 0 0 1 0-14z M20 20l-4-4',
  pin: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z M12 12a2 2 0 1 0 0-4a2 2 0 0 0 0 4z',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  home: 'M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z',
  plus: 'M12 5v14 M5 12h14',
  message: 'M4 5h16v11H8l-4 4z',
  person: 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  // Category and item icons (home.html)
  dress: 'M9 3h6l-1 5 4 13H6l4-13z',
  shirt: 'M8 4l4 2 4-2 4 3-2 3-2-1v11H8V9L6 10 4 7z',
  lamp: 'M9 3h6l3 8H6z M12 11v8 M8 21h8',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M11 18h2',
  bear: 'M7 7a2.5 2.5 0 1 1 3-3 M17 7a2.5 2.5 0 1 0-3-3 M12 5a6 6 0 1 1 0 12a6 6 0 0 1 0-12z M10 10h.01 M14 10h.01 M10.5 13.5c1 .8 2 .8 3 0',
  handbag: 'M5 8h14l-1 12H6z M9 8V6a3 3 0 0 1 6 0v2',
  shoe: 'M3 15c0-2 1-6 3-6 1 0 2 2 4 2s4-1 5 0 6 2 6 4v2H3z',
  // listing.html
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  share: 'M12 4v12 M8 8l4-4 4 4 M5 14v5h14v-5',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z M9 12l2 2 4-4',
  /** "⋯" (more options) - our own, in the same line style. */
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  // profile.html (list rows)
  list: 'M4 6h16 M4 12h16 M4 18h10',
  pencil: 'M4 20h4L19 9l-4-4L4 16z',
  globe: 'M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  blocked: 'M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18z M6 6l12 12',
  help: 'M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14 M12 17h.01',
} as const;

export type DesignIconName = keyof typeof ICON_PATHS;

type Props = {
  name: DesignIconName;
  size?: number;
  color: string;
  strokeWidth?: number;
  /** Filled inside (e.g. a liked heart). */
  fill?: string;
};

/** One design icon (outline). Decorative: screen readers skip it. */
export function DesignIcon({ name, size = 24, color, strokeWidth = 2, fill = 'none' }: Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Path d={ICON_PATHS[name]} />
    </Svg>
  );
}
