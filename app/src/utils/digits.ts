/**
 * Keep only digits. Arabic keyboards often type ٠١٢٣٤٥٦٧٨٩ (or Persian ۰۱۲...),
 * so those are turned into 0123456789 first. "٢ ٥٠٠ دج" -> "2500".
 */
export function onlyDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');
}

/** "2500" -> 2500, "" -> null. */
export function toAmount(text: string): number | null {
  const digits = onlyDigits(text);
  return digits ? Number(digits) : null;
}
