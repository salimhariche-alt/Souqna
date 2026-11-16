/** "0661234589" -> "06xx xx xx 89" (shows only the start and the end). */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone || phone.length < 4) return phone ?? '';
  return `${phone.slice(0, 2)}xx xx xx ${phone.slice(-2)}`;
}
