/**
 * Contrast between two colours (WCAG): 1 = none, 21 = black on white.
 * Normal text needs at least 4.5. Only "#RRGGBB" colours (not rgba).
 */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channel = (i: number) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const isHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);
