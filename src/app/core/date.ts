/** Utilidades de fechas locales (sin dependencias). */

const LOCALE = 'es-ES';

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/** Días de a → b (positivo si b es posterior). */
export function diffDays(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
}

export function fmtLong(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    fromISO(iso),
  );
}

export function fmtMedium(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(fromISO(iso));
}

export function fmtShort(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }).format(fromISO(iso));
}

export function fmtMonthShort(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { month: 'short' }).format(fromISO(iso));
}

export function fmtMonthTitle(year: number, month: number): string {
  const t = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' }).format(
    new Date(year, month, 1),
  );
  return t.charAt(0).toUpperCase() + t.slice(1);
}
