/**
 * useTokens(): the colours for the current light/dark mode and brand, plus sizes.
 *
 *   const tk = useTokens();
 *   <View style={{ backgroundColor: tk.color.surface, borderRadius: tk.radius.lg }} />
 *
 * <DesignOverride brand="atlas" scheme="dark"> changes them for everything inside it
 * (used by the Design preview screen to show the options side by side).
 */
import { createContext, type PropsWithChildren, useContext } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';

import {
  BRANDS,
  CHOSEN_BRAND,
  MaxWidth,
  MinTouch,
  NEUTRALS,
  Radius,
  Space,
  STATUS,
  type BrandColors,
  type BrandId,
  type NeutralColors,
  type StatusColors,
} from './tokens';
import { TextStyles } from './typography';

export type Scheme = 'light' | 'dark';
export type Colors = NeutralColors & StatusColors & BrandColors;

type Override = { brand?: BrandId; scheme?: Scheme };
const OverrideContext = createContext<Override>({});

export function DesignOverride({ brand, scheme, children }: PropsWithChildren<Override>) {
  const parent = useContext(OverrideContext);
  return (
    <OverrideContext.Provider value={{ brand: brand ?? parent.brand, scheme: scheme ?? parent.scheme }}>
      {children}
    </OverrideContext.Provider>
  );
}

export function colorsFor(brand: BrandId, scheme: Scheme): Colors {
  return { ...NEUTRALS[scheme], ...STATUS[scheme], ...BRANDS[brand][scheme] };
}

export function useTokens() {
  const phoneScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const override = useContext(OverrideContext);
  const scheme: Scheme = override.scheme ?? phoneScheme;
  const brand: BrandId = override.brand ?? CHOSEN_BRAND;
  return {
    scheme,
    brand,
    color: colorsFor(brand, scheme),
    space: Space,
    radius: Radius,
    text: TextStyles,
    maxWidth: MaxWidth,
    minTouch: MinTouch,
  };
}

export type Tokens = ReturnType<typeof useTokens>;
export { BRANDS, CHOSEN_BRAND, Radius, Space } from './tokens';
export type { BrandId } from './tokens';
export { FONT_ASSETS, FontFiles, TextStyles, type TextVariant } from './typography';
