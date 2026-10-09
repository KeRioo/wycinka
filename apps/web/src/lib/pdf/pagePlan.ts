import type { PdfPrefs } from '@/db/schema';

export interface PdfPagePlan {
  map: boolean;
  rangesTable: boolean;
  fullTable: boolean;
}

export function buildPdfPagePlan(prefs: PdfPrefs): PdfPagePlan[] {
  const tableSeparate = prefs.tableOnSeparatePage || prefs.layout === 'one-per-page';
  const numberedShared = prefs.layout === 'combined' && !tableSeparate && prefs.showNumberedTable;

  const firstPage: PdfPagePlan = {
    map: true,
    rangesTable: !tableSeparate,
    fullTable: numberedShared,
  };

  const pages: PdfPagePlan[] = [firstPage];

  if (tableSeparate) {
    pages.push({ map: false, rangesTable: true, fullTable: false });
  }

  if (prefs.showNumberedTable && !numberedShared) {
    pages.push({ map: false, rangesTable: false, fullTable: true });
  }

  return pages;
}
