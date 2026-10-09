import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Project, Tree } from '@/db/schema';
import { DEFAULT_PDF_PREFS, DEFAULT_RANGES, DEFAULT_SPECIES, type PdfPrefs } from '@/db/schema';

interface Call {
  op: string;
  args: unknown[];
}

const { FakeDoc } = vi.hoisted(() => {
  class FakeDocShim {
    calls: { op: string; args: unknown[] }[] = [];
    pages = 1;

    private log(op: string, args: unknown[]): void {
      this.calls.push({ op, args });
    }

    addPage(): void {
      this.pages += 1;
      this.log('addPage', []);
    }

    setPage(page: number): void {
      this.log('setPage', [page]);
    }

    getNumberOfPages(): number {
      return this.pages;
    }

    text(...args: unknown[]): void {
      this.log('text', args);
    }

    line(...args: unknown[]): void {
      this.log('line', args);
    }

    circle(...args: unknown[]): void {
      this.log('circle', args);
    }

    rect(...args: unknown[]): void {
      this.log('rect', args);
    }

    setFontSize(...args: unknown[]): void {
      this.log('setFontSize', args);
    }

    setFont(...args: unknown[]): void {
      this.log('setFont', args);
    }

    setTextColor(...args: unknown[]): void {
      this.log('setTextColor', args);
    }

    setDrawColor(...args: unknown[]): void {
      this.log('setDrawColor', args);
    }

    setFillColor(...args: unknown[]): void {
      this.log('setFillColor', args);
    }

    setLineWidth(...args: unknown[]): void {
      this.log('setLineWidth', args);
    }

    save(...args: unknown[]): void {
      this.log('save', args);
    }
  }

  return { FakeDoc: FakeDocShim };
});

vi.mock('jspdf', () => ({
  jsPDF: FakeDoc,
}));

import { generatePdfReport, pdfFileName } from '@/lib/pdf/pdfReport';

interface Doc { calls: Call[] }

function asDoc(doc: unknown): Doc {
  return doc as Doc;
}

function callsOf(doc: unknown, op: string): Call[] {
  return asDoc(doc).calls.filter((call) => call.op === op);
}

function textsOf(doc: unknown): string[] {
  return callsOf(asDoc(doc), 'text').map((call) => String(call.args[0]));
}

const PROJECT: Project = {
  id: 'p-1',
  name: 'Las Wolski',
  teryt: '146501_1.0001.12/3',
  polygon: {
    type: 'Polygon',
    coordinates: [
      [
        [21.0, 52.2],
        [21.02, 52.2],
        [21.02, 52.22],
        [21.0, 52.22],
        [21.0, 52.2],
      ],
    ],
  },
  speciesConfig: [...DEFAULT_SPECIES],
  rangesConfig: [...DEFAULT_RANGES],
  pdfPrefs: { ...DEFAULT_PDF_PREFS },
  createdAt: new Date('2026-01-01T10:00:00Z'),
  updatedAt: new Date('2026-01-01T10:00:00Z'),
};

function tree(partial: Partial<Tree> = {}): Tree {
  return {
    id: partial.id ?? crypto.randomUUID(),
    projectId: 'p-1',
    lat: 52.21,
    lng: 21.01,
    capturedAt: new Date('2026-01-05T10:00:00Z'),
    species: partial.species ?? 'Dąb',
    circumference: partial.circumference ?? 60,
    ...partial,
  };
}

describe('generatePdfReport', () => {
  beforeEach(() => {
    FakeDoc.prototype.calls = [];
    FakeDoc.prototype.pages = 1;
  });

  it('should fit the combined layout on a single page with all sections', () => {
    const prefs: PdfPrefs = { ...DEFAULT_PDF_PREFS, layout: 'combined' };
    const doc = generatePdfReport({
      project: PROJECT,
      trees: [tree()],
      prefs,
      generatedAt: new Date('2026-03-01T10:00:00Z'),
    });
    expect(callsOf(asDoc(doc), 'addPage')).toHaveLength(0);
    const texts = textsOf(asDoc(doc));
    expect(texts).toContain('Tabela zbiorcza — gatunek × przedziały obwodów');
    expect(texts).toContain('Pełna lista drzew');
  });

  it('should add a page for the numbered list when layout is single', () => {
    const prefs: PdfPrefs = { ...DEFAULT_PDF_PREFS, layout: 'single' };
    const doc = generatePdfReport({
      project: PROJECT,
      trees: [tree()],
      prefs,
      generatedAt: new Date('2026-03-01T10:00:00Z'),
    });
    expect(callsOf(asDoc(doc), 'addPage')).toHaveLength(1);
  });

  it('should add separate pages when tableOnSeparatePage is true', () => {
    const prefs: PdfPrefs = { ...DEFAULT_PDF_PREFS, layout: 'single', tableOnSeparatePage: true };
    const doc = generatePdfReport({
      project: PROJECT,
      trees: [tree()],
      prefs,
      generatedAt: new Date('2026-03-01T10:00:00Z'),
    });
    expect(callsOf(asDoc(doc), 'addPage')).toHaveLength(2);
  });

  it('should draw markers coloured by species', () => {
    const doc = generatePdfReport({
      project: PROJECT,
      trees: [tree({ species: 'Sosna' })],
      generatedAt: new Date('2026-03-01T10:00:00Z'),
    });
    const fills = callsOf(asDoc(doc), 'setFillColor').map((call) => String(call.args[0]));
    expect(fills).toContain('#15803d');
  });

  it('should draw larger markers for larger circumferences', () => {
    const doc = generatePdfReport({
      project: PROJECT,
      trees: [tree({ id: 't1', circumference: 60 }), tree({ id: 't2', circumference: 200 })],
      generatedAt: new Date('2026-03-01T10:00:00Z'),
    });
    const radii = callsOf(asDoc(doc), 'circle')
      .map((call) => Number(call.args[2]))
      .filter((radius) => Number.isFinite(radius) && radius > 0);
    const largest = Math.max(...radii);
    const others = radii.filter((radius) => radius !== largest);
    expect(largest).toBeGreaterThan(Math.min(...others));
  });

  it('should label numbered markers when showNumberedTable is on', () => {
    const doc = generatePdfReport({
      project: PROJECT,
      trees: [tree({ id: 't1' }), tree({ id: 't2' })],
      generatedAt: new Date('2026-03-01T10:00:00Z'),
    });
    expect(textsOf(asDoc(doc))).toContain('1');
    expect(textsOf(asDoc(doc))).toContain('2');
  });

  it('should draw the compass needle and skip the true-north note when autoRotate is off', () => {
    const prefs: PdfPrefs = { ...DEFAULT_PDF_PREFS, autoRotate: false };
    const doc = generatePdfReport({
      project: PROJECT,
      trees: [tree()],
      prefs,
      generatedAt: new Date('2026-03-01T10:00:00Z'),
    });
    expect(textsOf(asDoc(doc))).toContain('N');
    expect(textsOf(asDoc(doc))).not.toContain('Północ prawdziwa');
  });

  it('should include the true-north note when autoRotate is on', () => {
    const doc = generatePdfReport({
      project: PROJECT,
      trees: [tree()],
      generatedAt: new Date('2026-03-01T10:00:00Z'),
    });
    expect(textsOf(asDoc(doc))).toContain('Północ prawdziwa');
  });

  it('should write the report footer with date, count and circumference sum', () => {
    const doc = generatePdfReport({
      project: PROJECT,
      trees: [tree({ id: 't1', circumference: 60 }), tree({ id: 't2', circumference: 80 })],
      generatedAt: new Date('2026-03-01T10:00:00Z'),
    });
    const footer = textsOf(asDoc(doc)).find((text) => text.startsWith('Data raportu'));
    expect(footer).toContain('Drzew: 2');
    expect(footer).toContain('Suma obwodów: 140 cm');
  });

  it('should report a missing parcel instead of drawing geometry', () => {
    const noPolygon: Project = { ...PROJECT, polygon: undefined };
    const doc = generatePdfReport({
      project: noPolygon,
      trees: [tree()],
      generatedAt: new Date('2026-03-01T10:00:00Z'),
    });
    expect(textsOf(asDoc(doc))).toContain('Brak działki w projekcie');
  });
});

describe('pdfFileName', () => {
  it('should slugify the project name and add the date', () => {
    const name = pdfFileName(PROJECT, new Date('2026-03-01T10:00:00Z'));
    expect(name).toBe('wycinka-las-wolski-2026-03-01.pdf');
  });

  it('should use a fallback slug when the name is only punctuation', () => {
    const name = pdfFileName({ ...PROJECT, name: '!!!' }, new Date('2026-03-01T10:00:00Z'));
    expect(name).toBe('wycinka-projekt-2026-03-01.pdf');
  });
});
