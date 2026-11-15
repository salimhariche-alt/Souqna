/**
 * "il y a 3 jours" / "3 days ago" / "منذ 3 أيام".
 *
 * Written by hand instead of using Intl.RelativeTimeFormat / i18next plurals,
 * because the JavaScript engine in React Native (Hermes) doesn't fully support
 * them, and Arabic needs different words for 1, 2, 3-10 and 11+.
 */
import type { Language } from '@/i18n';

type Unit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** The largest whole unit that fits, e.g. 50 hours -> 2 days. */
function pickUnit(seconds: number): [number, Unit] | null {
  if (seconds < MINUTE) return null; // "just now"
  if (seconds < HOUR) return [Math.floor(seconds / MINUTE), 'minute'];
  if (seconds < DAY) return [Math.floor(seconds / HOUR), 'hour'];
  if (seconds < WEEK) return [Math.floor(seconds / DAY), 'day'];
  if (seconds < MONTH) return [Math.floor(seconds / WEEK), 'week'];
  if (seconds < YEAR) return [Math.floor(seconds / MONTH), 'month'];
  return [Math.floor(seconds / YEAR), 'year'];
}

const FR: Record<Unit, [string, string]> = {
  minute: ['minute', 'minutes'],
  hour: ['heure', 'heures'],
  day: ['jour', 'jours'],
  week: ['semaine', 'semaines'],
  month: ['mois', 'mois'],
  year: ['an', 'ans'],
};

const EN: Record<Unit, [string, string]> = {
  minute: ['minute', 'minutes'],
  hour: ['hour', 'hours'],
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
  year: ['year', 'years'],
};

// [one, two, 3-10 (plural), 11+ (singular with tanwin)]
const AR: Record<Unit, [string, string, string, string]> = {
  minute: ['دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'],
  hour: ['ساعة', 'ساعتين', 'ساعات', 'ساعة'],
  day: ['يوم', 'يومين', 'أيام', 'يومًا'],
  week: ['أسبوع', 'أسبوعين', 'أسابيع', 'أسبوعًا'],
  month: ['شهر', 'شهرين', 'أشهر', 'شهرًا'],
  year: ['سنة', 'سنتين', 'سنوات', 'سنة'],
};

function arabic(count: number, unit: Unit): string {
  const [one, two, few, many] = AR[unit];
  if (count === 1) return `منذ ${one}`;
  if (count === 2) return `منذ ${two}`;
  const lastTwo = count % 100;
  if (lastTwo >= 3 && lastTwo <= 10) return `منذ ${count} ${few}`;
  return `منذ ${count} ${many}`;
}

export function timeAgo(date: string | Date, language: Language, now: Date = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - new Date(date).getTime()) / 1000);
  const picked = pickUnit(seconds);

  if (!picked) {
    return { fr: "à l'instant", en: 'just now', ar: 'الآن' }[language];
  }
  const [count, unit] = picked;
  if (language === 'ar') return arabic(count, unit);
  if (language === 'en') return `${count} ${EN[unit][count === 1 ? 0 : 1]} ago`;
  return `il y a ${count} ${FR[unit][count === 1 ? 0 : 1]}`;
}
