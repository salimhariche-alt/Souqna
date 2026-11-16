/**
 * Times and days for the chat ("14:05", "Today", "Yesterday", "12 November").
 * Written by hand: React Native's JavaScript engine (Hermes) doesn't reliably have
 * localized date formats or month names.
 */
import type { Language } from '@/i18n';

import { MONTHS } from './dates';

const pad = (n: number) => String(n).padStart(2, '0');

/** "14:05" (24-hour clock, used in Algeria). */
export function clock(date: string | Date): string {
  const d = new Date(date);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Midnight at the start of that day, as a number (to compare days). */
export function dayKey(date: string | Date): number {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function daysAgo(date: string | Date, now: Date) {
  return Math.round((dayKey(now) - dayKey(date)) / 86400000);
}

type Words = { today: string; yesterday: string };

/** Separator in the chat: "Today", "Yesterday", "12 November" (+ year if not this year). */
export function dayLabel(date: string | Date, language: Language, words: Words, now = new Date()) {
  const ago = daysAgo(date, now);
  if (ago === 0) return words.today;
  if (ago === 1) return words.yesterday;
  const d = new Date(date);
  const label = `${d.getDate()} ${MONTHS[language][d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? label : `${label} ${d.getFullYear()}`;
}

/** In the list of conversations: "14:05" today, "Yesterday", else "12/11". */
export function shortStamp(date: string | Date, words: Words, now = new Date()) {
  const ago = daysAgo(date, now);
  if (ago === 0) return clock(date);
  if (ago === 1) return words.yesterday;
  const d = new Date(date);
  const label = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return d.getFullYear() === now.getFullYear() ? label : `${label}/${d.getFullYear()}`;
}
