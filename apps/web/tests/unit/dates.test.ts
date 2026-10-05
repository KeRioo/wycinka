import { describe, expect, it } from 'vitest';
import { formatDate } from '@/lib/dates';

describe('formatDate', () => {
  it('should format date as DD.MM.YYYY', () => {
    expect(formatDate(new Date(2026, 9, 4))).toBe('04.10.2026');
  });

  it('should zero-pad month and day', () => {
    expect(formatDate(new Date(2025, 0, 7))).toBe('07.01.2025');
  });

  it('should keep two-digit days unpadded', () => {
    expect(formatDate(new Date(2024, 11, 31))).toBe('31.12.2024');
  });
});
