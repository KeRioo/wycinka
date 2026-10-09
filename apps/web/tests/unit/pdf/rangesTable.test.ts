import { describe, expect, it } from 'vitest';
import { DEFAULT_RANGES, DEFAULT_SPECIES, type Tree } from '@/db/schema';
import {
  buildNumberedRows,
  buildRangesTable,
  buildSummary,
  rangeIndexOf,
} from '@/lib/pdf/rangesTable';

function tree(partial: Partial<Tree> = {}): Tree {
  return {
    id: partial.id ?? 't-1',
    projectId: 'p-1',
    lat: 52.23,
    lng: 21.01,
    capturedAt: partial.capturedAt ?? new Date('2026-01-01T10:00:00Z'),
    species: partial.species ?? 'Dąb',
    circumference: partial.circumference ?? 80,
    ...partial,
  };
}

describe('rangeIndexOf', () => {
  it('should return first range index when circumference matches lower bound', () => {
    expect(rangeIndexOf(50, DEFAULT_RANGES)).toBe(1);
  });

  it('should return last open-ended range when circumference exceeds all upper bounds', () => {
    expect(rangeIndexOf(250, DEFAULT_RANGES)).toBe(DEFAULT_RANGES.length - 1);
  });

  it('should bucket values below the first lower bound into the first range', () => {
    expect(rangeIndexOf(30, DEFAULT_RANGES)).toBe(0);
  });
});

describe('buildRangesTable', () => {
  it('should aggregate tree circumferences into range columns per species', () => {
    const trees = [
      tree({ id: 'a', species: 'Dąb', circumference: 60 }),
      tree({ id: 'b', species: 'Dąb', circumference: 110 }),
      tree({ id: 'c', species: 'Sosna', circumference: 60 }),
    ];
    const table = buildRangesTable(trees, DEFAULT_SPECIES, DEFAULT_RANGES);
    const dab = table.rows.find((row) => row.species === 'Dąb');
    const sosna = table.rows.find((row) => row.species === 'Sosna');
    expect(dab?.counts[1]).toBe(1);
    expect(dab?.counts[3]).toBe(1);
    expect(dab?.total).toBe(2);
    expect(sosna?.counts[1]).toBe(1);
    expect(sosna?.total).toBe(1);
  });

  it('should keep species in speciesConfig order', () => {
    const trees = [tree({ id: 'a', species: 'Sosna' }), tree({ id: 'b', species: 'Dąb' })];
    const table = buildRangesTable(trees, DEFAULT_SPECIES, DEFAULT_RANGES);
    expect(table.rows.map((row) => row.species)).toEqual(['Dąb', 'Sosna']);
  });

  it('should fall back to Inne species with fallback color for unknown species', () => {
    const trees = [tree({ id: 'a', species: 'Cyprys' })];
    const table = buildRangesTable(trees, DEFAULT_SPECIES, DEFAULT_RANGES);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]?.species).toBe('Inne');
    expect(table.rows[0]?.color).toBe('#6b7280');
  });

  it('should use configured species color for known species', () => {
    const table = buildRangesTable([tree({ species: 'Sosna' })], DEFAULT_SPECIES, DEFAULT_RANGES);
    expect(table.rows[0]?.color).toBe('#15803d');
  });

  it('should expose range labels plus Razem as columns', () => {
    const table = buildRangesTable([], DEFAULT_SPECIES, DEFAULT_RANGES);
    expect(table.columns.at(-1)).toBe('Razem');
    expect(table.columns[0]).toBe(DEFAULT_RANGES[0]?.label);
    expect(table.rows).toHaveLength(0);
  });
});

describe('buildSummary', () => {
  it('should count trees and sum circumferences', () => {
    const summary = buildSummary([tree({ circumference: 80 }), tree({ circumference: 120 })]);
    expect(summary.treeCount).toBe(2);
    expect(summary.totalCircumference).toBe(200);
  });

  it('should return zeros for an empty list', () => {
    expect(buildSummary([])).toEqual({ treeCount: 0, totalCircumference: 0 });
  });
});

describe('buildNumberedRows', () => {
  it('should number trees chronologically by capture time', () => {
    const rows = buildNumberedRows([
      tree({ id: 'later', capturedAt: new Date('2026-02-01T10:00:00Z') }),
      tree({ id: 'earlier', capturedAt: new Date('2026-01-01T10:00:00Z') }),
    ]);
    expect(rows.map((row) => row.nr)).toEqual([1, 2]);
    expect(rows[0]?.species).toBe('Dąb');
  });

  it('should format the location as fixed decimal lat, lng', () => {
    const rows = buildNumberedRows([tree({ lat: 52.2301234, lng: 21.0111123 })]);
    expect(rows[0]?.location).toBe('52.23012, 21.01111');
  });
});
