/**
 * useTokens(): the colours for the current light/dark mode, plus fonts and sizes.
 *
 *   const tk = useTokens();
 *   <View style={{ backgroundColor: tk.color.surface, borderRadius: tk.radius.xl }} />
 *
 * <DesignOverride scheme="dark"> forces light or dark for everything inside it
 * (used by the Design preview screen to show both side by side).
 */
import { createContext, type PropsWithChildren, useContext } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';

import {
  BrandPalette,
  ButtonHeight,
  COLORS,
  MaxWidth,
  MinTouch,
  Radius,
  Space,
  TINTS,
  type Colors,
} from './tokens';
import { TextStyles } from './typography';

export type Scheme = 'light' | 'dark';
export type { Colors };

type Override = { scheme?: Scheme };
const OverrideContext = createContext<Override>({});

export function DesignOverride({ scheme, children }: PropsWithChildren<Override>) {
  const parent = useContext(OverrideContext);
  return (
    <OverrideContext.Provider value={{ scheme: scheme ?? parent.scheme }}>{children}</OverrideContext.Provider>
  );
}

export function colorsFor(scheme: Scheme): Colors {
  return COLORS[scheme];
}

export function useTokens() {
  const phoneScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const override = useContext(OverrideContext);
  const scheme: Scheme = override.scheme ?? phoneScheme;
  const color = colorsFor(scheme);
  return {
    scheme,
    color,
    /** The 5 soft tints as a list: tk.tints[i % 5] */
    tints: TINTS.map((key) => color[key]),
    brand: BrandPalette,
    space: Space,
    radius: Radius,
    /** Latin text styles. For text that may be Arabic, use <AppText> (it switches font). */
    text: TextStyles,
    maxWidth: MaxWidth,
    minTouch: MinTouch,
    buttonHeight: ButtonHeight,
  };
}

export type Tokens = ReturnType<typeof useTokens>;
export { BrandPalette, COLORS, Radius, Space, TINTS, type TintKey } from './tokens';
export {
  ArabicTextStyles,
  FONT_ASSETS,
  FontFiles,
  hasArabic,
  TextStyles,
  textStyleFor,
  type TextVariant,
} from './typography';
