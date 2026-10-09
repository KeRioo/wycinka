import { describe, expect, it } from 'vitest';
import type { PdfPrefs } from '@/db/schema';
import { buildPdfPagePlan } from '@/lib/pdf/pagePlan';

const prefs = (overrides: Partial<PdfPrefs>): PdfPrefs => ({
  layout: 'single',
  markerColorBy: 'species',
  markerSizeBy: 'circumference',
  markerScale: { baseSize: 3, perCm: 0.06, maxSize: 18 },
  showNumberedTable: true,
  tableOnSeparatePage: false,
  autoRotate: true,
  ...overrides,
});

describe('buildPdfPagePlan', () => {
  it('should put map and ranges table on one page when layout is single and tables are not separate', () => {
    const plan = buildPdfPagePlan(prefs({ layout: 'single' }));
    expect(plan).toHaveLength(2);
    expect(plan[0]).toEqual({ map: true, rangesTable: true, fullTable: false });
    expect(plan[1]).toEqual({ map: false, rangesTable: false, fullTable: true });
  });

  it('should put everything on one page when layout is combined and tables are not separate', () => {
    const plan = buildPdfPagePlan(prefs({ layout: 'combined' }));
    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({ map: true, rangesTable: true, fullTable: true });
  });

  it('should force separate table pages when layout is one-per-page', () => {
    const plan = buildPdfPagePlan(
      prefs({ layout: 'one-per-page', tableOnSeparatePage: false }),
    );
    expect(plan).toEqual([
      { map: true, rangesTable: false, fullTable: false },
      { map: false, rangesTable: true, fullTable: false },
      { map: false, rangesTable: false, fullTable: true },
    ]);
  });

  it('should split all sections onto separate pages when tableOnSeparatePage is true', () => {
    const plan = buildPdfPagePlan(prefs({ layout: 'single', tableOnSeparatePage: true }));
    expect(plan).toEqual([
      { map: true, rangesTable: false, fullTable: false },
      { map: false, rangesTable: true, fullTable: false },
      { map: false, rangesTable: false, fullTable: true },
    ]);
  });

  it('should omit the numbered table page when showNumberedTable is false', () => {
    const plan = buildPdfPagePlan(prefs({ layout: 'single', showNumberedTable: false }));
    expect(plan).toEqual([{ map: true, rangesTable: true, fullTable: false }]);
  });
});
