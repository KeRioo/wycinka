import type { Project, Tree, RangeConfig } from '@/db/schema';
import type { Geometry } from '@/services/api.types';
import { DEFAULT_PDF_PREFS, DEFAULT_SPECIES, type PdfPrefs } from '@/db/schema';
import type { Parcel } from '@/services/api.types';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import fixtures from './__fixtures__/parcels.json';

const { FakeDoc } = vi.hoisted(() => {
  class FakeDocShim {
    calls: { op: string; args: unknown[] }[] = [];
    pages = 1;

    private log(op: string, args: unknown[]): void {
      this.calls.push({ op, args });
    }

    addPage(): void {      this.pages += 1;
      this.log('addPage', []);
    }

    setPage(page: number): void {
      if (page > this.pages) {
        this.pages = page;
      }
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

    lines(...args: unknown[]): void {
      this.log('lines', args);
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

    setDrawColor(color: string): void {
      this.log('setDrawColor', [color]);
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

import { generatePdfReport } from '@/lib/pdf/pdfReport';

interface Call {
  op: string;
  args: unknown[];
}

interface RectCall {
  x: number;
  y: number;
  w: number;
  h: number;
  style: string;
}

interface TextCall {
  text: string;
  x: number;
  y: number;
}

interface CircleCall {
  x: number;
  y: number;
  r: number;
}

interface ParcelFixture {
  id: string;
  center: number[];
  spanLng: number;
  spanLat: number;
}

interface TreeFixture {
  species: string;
  circumference: number;
  dx: number;
  dy: number;
}

const PARCEL_FIXTURES = fixtures.parcels as ParcelFixture[];
const TREE_FIXTURES = fixtures.treeOffsets as TreeFixture[];
const OUTSIDE_TREE = fixtures.outsideTree;

const DEFAULT_RANGES: RangeConfig[] = [
  { from: 0, to: 50, label: '< 50 cm' },
  { from: 50, to: 75, label: '50–75 cm' },
  { from: 75, to: 100, label: '75–100 cm' },
  { from: 100, to: 125, label: '100–125 cm' },
  { from: 125, to: 150, label: '125–150 cm' },
  { from: 150, to: 200, label: '150–200 cm' },
  { from: 200, to: Number.POSITIVE_INFINITY, label: '> 200 cm' },
];

const PROJECT: Project = {
  id: 'p-1',
  name: 'Las Wolski',
  teryt: '146501_1.0001.12/3',
  polygon: undefined,
  speciesConfig: [...DEFAULT_SPECIES],
  rangesConfig: DEFAULT_RANGES,
  pdfPrefs: { ...DEFAULT_PDF_PREFS },
  createdAt: new Date('2026-01-01T10:00:00Z'),
  updatedAt: new Date('2026-01-01T10:00:00Z'),
};

const GENERATION_DATE = new Date('2026-03-01T10:00:00Z');

function ringGeometry(
  center: readonly [number, number],
  spanLng: number,
  spanLat: number,
): Geometry {
  const [cx, cy] = center;
  const halfLng = spanLng / 2;
  const halfLat = spanLat / 2;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [cx - halfLng, cy - halfLat],
        [cx + halfLng, cy - halfLat],
        [cx + halfLng, cy + halfLat],
        [cx - halfLng, cy + halfLat],
        [cx - halfLng, cy - halfLat],
      ],
    ],
  };
}

function parcelFor(index: number): Parcel {
  const entry = PARCEL_FIXTURES[index];
  const [cx, cy] = entry.center as [number, number];
  return {
    id: entry.id,
    teryt: `${entry.id.toUpperCase()}_1.0001.${String(index + 1)}`,
    number: entry.id,
    voivodeship: 'mazowieckie',
    county: 'Warszawa',
    commune: 'Śródmieście',
    region: '0001',
    region_name: 'Obręb 0001',
    area_m2: 10000,
    land_use: 'Ls',
    geom: ringGeometry([cx, cy], entry.spanLng, entry.spanLat),
    bbox: [
      cx - entry.spanLng / 2,
      cy - entry.spanLat / 2,
      cx + entry.spanLng / 2,
      cy + entry.spanLat / 2,
    ],
    centroid: [cx, cy],
    fetched_at: '2026-09-29T03:00:00Z',
    voivodeship_code: '14',
    county_code: '12',
    commune_code: '01',
    datasource: 'uldk',
  };
}

function treeFor(entry: TreeFixture, index: number, parcelIndex: number): Tree {
  const parcel = PARCEL_FIXTURES[parcelIndex];
  const [cx, cy] = parcel.center as [number, number];
  return {
    id: `t-${String(parcelIndex)}-${String(index)}`,
    projectId: 'p-1',
    lat: cy + entry.dy * (parcel.spanLat / 2),
    lng: cx + entry.dx * (parcel.spanLng / 2),
    capturedAt: new Date('2026-01-05T10:00:00Z'),
    species: entry.species,
    circumference: entry.circumference,
  };
}

function treesForParcel(parcelIndex: number, extraOutside = false): Tree[] {
  const trees = TREE_FIXTURES.map((entry, index) => treeFor(entry, index, parcelIndex));
  if (extraOutside) {
    trees.push(treeFor(OUTSIDE_TREE, 99, parcelIndex));
  }
  return trees;
}

function asCalls(doc: unknown): Call[] {
  return (doc as { calls: Call[] }).calls;
}

function rectsOf(doc: unknown, style?: string): RectCall[] {
  return asCalls(doc)
    .filter((call) => call.op === 'rect')
    .map((call) => ({
      x: Number(call.args[0]),
      y: Number(call.args[1]),
      w: Number(call.args[2]),
      h: Number(call.args[3]),
      style: typeof call.args[4] === 'string' ? call.args[4] : 'unknown',
    }))
    .filter((rect) => style === undefined || rect.style === style);
}

function textsOf(doc: unknown): TextCall[] {
  return asCalls(doc)
    .filter((call) => call.op === 'text')
    .map((call) => ({
      text: String(call.args[0]),
      x: Number(call.args[1]),
      y: Number(call.args[2]),
    }));
}

function circlesOf(doc: unknown): CircleCall[] {
  return asCalls(doc)
    .filter((call) => call.op === 'circle')
    .map((call) => ({
      x: Number(call.args[0]),
      y: Number(call.args[1]),
      r: Number(call.args[2]),
    }))
    .filter((circle) => circle.r > 0.5);
}

function ringLineExtents(doc: unknown): { dx: number; dy: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  let recording = false;
  for (const call of asCalls(doc)) {
    if (call.op === 'setDrawColor') {
      recording = call.args[0] === '#15803d';
    }
    if (recording && call.op === 'line') {
      xs.push(Number(call.args[0]), Number(call.args[2]));
      ys.push(Number(call.args[1]), Number(call.args[3]));
    }
  }
  if (xs.length === 0) {
    return null;
  }
  return { dx: Math.max(...xs) - Math.min(...xs), dy: Math.max(...ys) - Math.min(...ys) };
}

function mapRectOf(doc: unknown): RectCall {
  const frames = rectsOf(doc, 'S').filter((rect) => rect.w > 100 && rect.h > 60);
  expect(frames.length).toBeGreaterThanOrEqual(1);
  return frames[0];
}

const PAGE_H = 297;
const PAGE_W = 210;

beforeEach(() => {
  FakeDoc.prototype.calls = [];
  FakeDoc.prototype.pages = 1;
});

function expectKmAspectRatio(doc: unknown, parcel: ParcelFixture, margin = 0.15): void {
  const extents = ringLineExtents(doc);
  expect(extents).not.toBeNull();
  const kmPerDegLng = 111.32 * Math.cos((parcel.center[1] * Math.PI) / 180);
  const expected = (parcel.spanLng * kmPerDegLng) / (parcel.spanLat * 110.574);
  expect(extents!.dx / extents!.dy).toBeGreaterThan(expected * (1 - margin));
  expect(extents!.dx / extents!.dy).toBeLessThan(expected * (1 + margin));
}

describe('pdf map geometry — aspect ratio', () => {
  for (const parcelIndex of [0, 1, 2]) {
    it(`should preserve the metric aspect ratio for parcel ${String(parcelIndex)}`, () => {
      const parcel = PARCEL_FIXTURES[parcelIndex];
      const doc = generatePdfReport({
        project: { ...PROJECT, polygon: parcelFor(parcelIndex).geom },
        trees: [],
        prefs: { ...DEFAULT_PDF_PREFS, autoRotate: false, layout: 'one-per-page' },
        generatedAt: GENERATION_DATE,
      });
      expectKmAspectRatio(doc, parcel);
    });
  }

  it('should preserve aspect ratio with autoRotate enabled', () => {
    const parcel = PARCEL_FIXTURES[1];
    const doc = generatePdfReport({
      project: { ...PROJECT, polygon: parcelFor(1).geom },
      trees: treesForParcel(1),
      prefs: { ...DEFAULT_PDF_PREFS, layout: 'one-per-page' },
      generatedAt: GENERATION_DATE,
    });
    expectKmAspectRatio(doc, parcel, 0.2);
  });
});

function compactOverflowTrees(parcel: Parcel): Tree[] {
  return DEFAULT_SPECIES.filter((species) => species.name !== 'Inne')
    .slice(0, 14)
    .map((species, index) => {
      const angle = (index / 14) * 2 * Math.PI;
      const rx = parcel.bbox[0] + (index + 1) * 0.3 * ((parcel.bbox[2] - parcel.bbox[0]) / 15);
      const ry =
        parcel.bbox[1] + Math.abs(Math.cos(angle)) * ((parcel.bbox[3] - parcel.bbox[1]) / 2);
      return {
        id: `tree-overflow-${String(index)}`,
        projectId: 'p-1',
        lat: ry,
        lng: rx,
        capturedAt: new Date('2026-01-05T10:00:00Z'),
        species: species.name,
        circumference: 60 + index * 5,
      };
    });
}

describe('pdf page containment', () => {
  for (const parcelIndex of [0, 1, 2]) {
    it(`should keep combined-layout content inside the page for parcel ${String(parcelIndex)}`, () => {
      const parcel = parcelFor(parcelIndex);
      const trees = compactOverflowTrees(parcel);
      const prefs: PdfPrefs = { ...DEFAULT_PDF_PREFS, layout: 'combined' };
      const doc = generatePdfReport({
        project: {
          ...PROJECT,
          polygon: parcel.geom,
          pdfPrefs: prefs,
        },
        trees,
        prefs,
        generatedAt: GENERATION_DATE,
      });
      const pageRects = rectsOf(doc, 'S').filter(
        (rect) => rect.w < PAGE_W - 5 && rect.h < PAGE_H - 5,
      );
      for (const rect of pageRects) {
        expect(rect.y + rect.h).toBeLessThanOrEqual(PAGE_H - 4);
        expect(rect.y).toBeGreaterThanOrEqual(0);
      }
      for (const text of textsOf(doc)) {
        if (text.text.startsWith('Data raportu')) {
          continue;
        }
        expect(text.y).toBeLessThanOrEqual(PAGE_H - 6);
      }
    });
  }

  it('should not overlap the numbered list with the ranges table in the combined layout', () => {
    const parcel = parcelFor(1);
    const trees = [treesForParcel(1)[0], treesForParcel(1)[1], treesForParcel(1)[2]];
    const doc = generatePdfReport({
      project: { ...PROJECT, polygon: parcel.geom },
      trees,
      prefs: { ...DEFAULT_PDF_PREFS, layout: 'combined' },
      generatedAt: GENERATION_DATE,
    });
    const title = textsOf(doc).find((call) => call.text === 'Pełna lista drzew');
    expect(title).toBeDefined();
    const rangesHeaderBottom = 30 + 150 + 10 + 4 + 7;
    expect(title!.y).toBeGreaterThanOrEqual(rangesHeaderBottom + 4);
  });

  it('should paginate the ranges table instead of drawing rows below the page', () => {
    const parcel = parcelFor(0);
    const allSpecies = DEFAULT_SPECIES.filter((species) => species.name !== 'Inne');
    const trees: Tree[] = allSpecies.map((species, index) => ({
      id: `tree-species-${String(index)}`,
      projectId: 'p-1',
      lat: 52.2,
      lng: 21.1,
      capturedAt: new Date('2026-01-05T10:00:00Z'),
      species: species.name,
      circumference: 60 + index,
    }));
    const doc = generatePdfReport({
      project: { ...PROJECT, polygon: parcel.geom },
      trees,
      prefs: { ...DEFAULT_PDF_PREFS, tableOnSeparatePage: true, layout: 'one-per-page' },
      generatedAt: GENERATION_DATE,
    });
    const rows = rectsOf(doc, 'S').filter((rect) => rect.w > 60 && rect.h < 10);
    expect(rows.length).toBeGreaterThan(8);
    for (const row of rows) {
      expect(row.y + row.h).toBeLessThanOrEqual(PAGE_H - 4);
    }
  });
});

describe('pdf map markers', () => {
  for (const parcelIndex of [0, 1, 2]) {
    it(`should keep tree markers inside the map frame for parcel ${String(parcelIndex)}`, () => {
      const parcel = parcelFor(parcelIndex);
      const doc = generatePdfReport({
        project: { ...PROJECT, polygon: parcel.geom },
        trees: treesForParcel(parcelIndex, true),
        prefs: { ...DEFAULT_PDF_PREFS, layout: 'one-per-page' },
        generatedAt: GENERATION_DATE,
      });
      const mapArea = mapRectOf(doc);
      const markerCircles = circlesOf(doc);
      expect(markerCircles.length).toBeGreaterThanOrEqual(TREE_FIXTURES.length);
      for (const circle of markerCircles) {
        expect(circle.x - circle.r).toBeGreaterThanOrEqual(mapArea.x);
        expect(circle.x + circle.r).toBeLessThanOrEqual(mapArea.x + mapArea.w);
        expect(circle.y - circle.r).toBeGreaterThanOrEqual(mapArea.y);
        expect(circle.y + circle.r).toBeLessThanOrEqual(mapArea.y + mapArea.h);
      }
    });
  }
});
