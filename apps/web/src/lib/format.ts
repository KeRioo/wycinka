import { formatDate } from '@/lib/dates';

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) {
    return formatDateTime(date);
  }
  if (diffMs < MINUTE_MS) {
    return 'teraz';
  }
  if (diffMs < HOUR_MS) {
    const minutes = Math.max(1, Math.floor(diffMs / MINUTE_MS));
    return `${String(minutes)} min. temu`;
  }
  if (diffMs < DAY_MS) {
    const hours = Math.floor(diffMs / HOUR_MS);
    return hours === 1 ? 'godz. temu' : `${String(hours)} godz. temu`;
  }
  const yesterday = new Date(now.getTime() - DAY_MS);
  if (isSameCalendarDay(date, yesterday)) {
    return `wczoraj ${formatTime(date)}`;
  }
  return formatDateTime(date);
}

export interface ParcelRow {
  number: string;
  commune?: string;
  region_name?: string;
}

export function formatParcelNumbers(parcels: readonly ParcelRow[]): string {
  if (parcels.length === 0) {
    return '';
  }
  const shown = parcels.slice(0, 2).map((p) => p.number);
  const more = parcels.length > 2 ? ' …' : '';
  return `${shown.join(', ')}${more}`;
}

export function formatParcelsLine(
  parcels: readonly ParcelRow[],
  locality: string | null = parcels[0]?.commune ?? parcels[0]?.region_name ?? null,
): string {
  if (parcels.length === 0) {
    return 'Brak działek';
  }
  const numbers = formatParcelNumbers(parcels);
  const label = parcels.length === 1 ? 'Działka' : 'Działki';
  return locality !== null ? `Działka ${numbers} • ${locality}` : `${label} ${numbers}`;
}

export function formatTreeCount(count: number): string {
  if (count === 1) {
    return '1 drzewo';
  }
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  const isTeen = lastTwo >= 12 && lastTwo <= 14;
  const word = lastDigit >= 2 && lastDigit <= 4 && !isTeen ? 'drzewa' : 'drzew';
  return `${String(count)} ${word}`;
}
