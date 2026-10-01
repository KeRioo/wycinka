import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number,
): (...args: TArgs) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: TArgs) => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

export function formatArea(areaM2: number): string {
  if (areaM2 < 10_000) {
    return `${areaM2.toFixed(0)} m²`;
  }
  const ha = areaM2 / 10_000;
  return `${ha.toFixed(2)} ha`;
}

export function formatCoordinate(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
