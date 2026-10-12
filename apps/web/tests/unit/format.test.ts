import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  formatParcelNumbers,
  formatParcelsLine,
  formatRelativeTime,
  formatTreeCount,
  isSameCalendarDay,
} from '@/lib/format';

const NOW = new Date(2025, 2, 15, 12, 30);

describe('formatRelativeTime', () => {
  it('test_returns_teraz_when_under_a_minute', () => {
    const date = new Date(NOW.getTime() - 20_000);
    expect(formatRelativeTime(date, NOW)).toBe('teraz');
  });

  it('test_returns_minutes_when_under_an_hour', () => {
    const date = new Date(NOW.getTime() - 5 * 60_000);
    expect(formatRelativeTime(date, NOW)).toBe('5 min. temu');
  });

  it('test_returns_one_hour_temu_when_exactly_one_hour', () => {
    const date = new Date(NOW.getTime() - 3_600_000 - 30_000);
    expect(formatRelativeTime(date, NOW)).toBe('godz. temu');
  });

  it('test_returns_hours_when_under_a_day', () => {
    const date = new Date(NOW.getTime() - 3 * 3_600_000);
    expect(formatRelativeTime(date, NOW)).toBe('3 godz. temu');
  });

  it('test_returns_wczoraj_with_time_when_previous_calendar_day', () => {
    const date = new Date(2025, 2, 14, 9, 5);
    expect(formatRelativeTime(date, NOW)).toBe('wczoraj 09:05');
  });

  it('test_returns_absolute_format_for_older_dates', () => {
    const date = new Date(2025, 2, 13, 15, 31);
    expect(formatRelativeTime(date, NOW)).toBe('13.03.2025 15:31');
  });

  it('test_returns_absolute_format_when_date_is_in_the_future', () => {
    const date = new Date(2026, 4, 1, 10, 0);
    expect(formatRelativeTime(date, NOW)).toBe('01.05.2026 10:00');
  });
});

describe('isSameCalendarDay', () => {
  it('test_returns_true_for_same_day', () => {
    expect(isSameCalendarDay(new Date(2025, 2, 14, 1, 0), new Date(2025, 2, 14, 23, 0))).toBe(true);
  });

  it('test_returns_false_for_different_day', () => {
    expect(isSameCalendarDay(new Date(2025, 2, 13), new Date(2025, 2, 14))).toBe(false);
  });
});

describe('formatDateTime', () => {
  it('test_formats_date_with_time', () => {
    const date = new Date(2025, 2, 15, 8, 5);
    expect(formatDateTime(date)).toBe('15.03.2025 08:05');
  });
});

describe('formatParcelNumbers', () => {
  it('test_returns_empty_string_when_no_parcels', () => {
    expect(formatParcelNumbers([])).toBe('');
  });

  it('test_returns_single_number', () => {
    expect(formatParcelNumbers([{ number: '251/1' }])).toBe('251/1');
  });

  it('test_returns_two_numbers_joined', () => {
    expect(formatParcelNumbers([{ number: '251/1' }, { number: '251/2' }])).toBe('251/1, 251/2');
  });

  it('test_appends_ellipsis_when_more_than_two', () => {
    expect(formatParcelNumbers([{ number: '251/1' }, { number: '251/2' }, { number: '251/3' }])).toBe(
      '251/1, 251/2 …',
    );
  });
});

describe('formatParcelsLine', () => {
  it('test_returns_brak_dzialek_when_empty', () => {
    expect(formatParcelsLine([])).toBe('Brak działek');
  });

  it('test_returns_locality_from_commune', () => {
    const line = formatParcelsLine([{ number: '251/1', commune: 'Otwock', region_name: 'Obręb 0001' }]);
    expect(line).toBe('Działka 251/1 • Otwock');
  });

  it('test_falls_back_to_region_name_when_commune_missing', () => {
    const line = formatParcelsLine([{ number: '6509', region_name: 'Obręb 0001' }]);
    expect(line).toBe('Działka 6509 • Obręb 0001');
  });

  it('test_uses_dzialki_label_for_two_parcels', () => {
    const line = formatParcelsLine([
      { number: '251/1', commune: 'Otwock' },
      { number: '251/2', commune: 'Otwock' },
    ]);
    expect(line).toBe('Działka 251/1, 251/2 • Otwock');
  });

  it('test_returns_numbers_without_locality_when_missing', () => {
    expect(formatParcelsLine([{ number: '251/1' }])).toBe('Działka 251/1');
  });
});

describe('formatTreeCount', () => {
  it('test_single_tree', () => {
    expect(formatTreeCount(1)).toBe('1 drzewo');
  });

  it('test_two_to_four_trees_use_drzewa', () => {
    expect(formatTreeCount(2)).toBe('2 drzewa');
    expect(formatTreeCount(4)).toBe('4 drzewa');
    expect(formatTreeCount(22)).toBe('22 drzewa');
  });

  it('test_five_or_more_trees_use_drzew', () => {
    expect(formatTreeCount(5)).toBe('5 drzew');
    expect(formatTreeCount(100)).toBe('100 drzew');
  });

  it('test_teens_use_drzew', () => {
    expect(formatTreeCount(12)).toBe('12 drzew');
    expect(formatTreeCount(14)).toBe('14 drzew');
  });

  it('test_many_trees_use_drzew', () => {
    expect(formatTreeCount(100)).toBe('100 drzew');
  });
});
