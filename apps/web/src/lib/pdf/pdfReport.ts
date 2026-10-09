import { jsPDF } from 'jspdf';
import type { Project, Tree } from '@/db/schema';
import { getSpeciesColor, markerSizeForCm } from '@/lib/geo';
import { formatDate } from '@/lib/dates';
import { buildNumberedRows, buildRangesTable, buildSummary } from './rangesTable';
import {
  bboxOf,
  chooseRotation,
  makeProjector,
  polygonPoints,
  midLatOf,
  rotatePoints,
  toKm,
  type LngLat,
  type Rect,
} from './geometry';
import { compassNeedle } from './compass';
import { buildPdfPagePlan, type PdfPagePlan } from './pagePlan';
import type { Parcel, ParcelAggregateResponse } from '@/services/api.types';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
const CONTENT_W = PAGE_W - MARGIN * 2;
const MAP_RECT: Rect = { x: MARGIN, y: 30, w: CONTENT_W, h: 150 };
const MAP_RECT_FULL: Rect = { x: MARGIN, y: 30, w: CONTENT_W, h: 210 };
const TERYT_LIST_LIMIT = 4;

export interface PdfExportInput {
  readonly project: Project;
  readonly trees: readonly Tree[];
  readonly parcels?: readonly Parcel[];
  readonly aggregate?: ParcelAggregateResponse | null;
  readonly prefs?: Project['pdfPrefs'];
  readonly generatedAt?: Date;
}

export type PageSection = 'map' | 'rangesTable' | 'fullTable';

export function pageSections(plan: PdfPagePlan): PageSection[] {
  return (['map', 'rangesTable', 'fullTable'] as const).filter((key) => plan[key]);
}

export function buildParcelHeader(
  project: Project,
  parcels: readonly Parcel[],
): string {
  if (parcels.length === 1 && project.teryt === parcels[0]?.teryt) {
    return `TERYT: ${project.teryt}`;
  }
  if (parcels.length === 1) {
    return `TERYT: ${parcels[0]?.teryt ?? project.teryt}`;
  }
  if (parcels.length > 1) {
    const shown = parcels
      .slice(0, TERYT_LIST_LIMIT)
      .map((p) => p.teryt)
      .join(', ');
    const dots = parcels.length > TERYT_LIST_LIMIT ? '…' : '';
    return `Działki: ${String(parcels.length)} (${shown}${dots})`;
  }
  if (project.teryt === undefined) {
    return 'TERYT: —';
  }
  return `TERYT: ${project.teryt}`;
}

type OuterRing = LngLat[];

type RingProjector = (lng: number, lat: number) => [number, number];

export function clampInside(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function drawRingOutlines(doc: jsPDF, rings: readonly OuterRing[], project: RingProjector): void {
  rings.forEach((ring) => {
    for (let i = 0; i < ring.length; i++) {
      const a = project(ring[i][0], ring[i][1]);
      const next = ring[(i + 1) % ring.length];
      const b = project(next[0], next[1]);
      doc.line(a[0], a[1], b[0], b[1]);
    }
  });
}

function outerRingsOfGeometry(geometry: Parcel['geom']): OuterRing[] {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.slice(0, 1).map((ring) => ring.map(([lng, lat]) => [lng, lat] as LngLat));
  }
  return geometry.coordinates.map((polygon) =>
    polygon.slice(0, 1).flatMap((ring) => ring.map(([lng, lat]) => [lng, lat] as LngLat)),
  );
}

export function collectMapRings(input: PdfExportInput): readonly OuterRing[] {
  if (input.aggregate !== null && input.aggregate !== undefined) {
    if (input.aggregate.type === 'Polygon') {
      const ring = input.aggregate.coordinates[0] as LngLat[];
      return [ring.map(([lng, lat]) => [lng, lat] as LngLat)];
    }
    const polys = input.aggregate.coordinates as LngLat[][][];
    return polys.flatMap((polygon) =>
      polygon.slice(0, 1).map((ring) => ring.map(([lng, lat]) => [lng, lat] as LngLat)),
    );
  }
  if (input.parcels !== undefined && input.parcels.length > 0) {
    return input.parcels.flatMap((parcel) => outerRingsOfGeometry(parcel.geom));
  }
  const polygon = input.project.polygon;
  if (polygon === undefined) {
    return [];
  }
  const ring = polygonPoints(polygon);
  return ring.length > 0 ? [ring] : [];
}

export function generatePdfReport(input: PdfExportInput): jsPDF {
  const prefs = input.prefs ?? input.project.pdfPrefs;
  const generatedAt = input.generatedAt ?? new Date();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const plans = buildPdfPagePlan(prefs);
  const summary = buildSummary(input.trees);
  const teryt = buildParcelHeader(input.project, input.parcels ?? []);

  plans.forEach((plan, index) => {
    if (index > 0) {
      doc.addPage();
    }
    const sections = pageSections(plan);
    drawPage(doc, input, prefs, index + 1, plans.length, teryt, generatedAt, summary, sections);
  });

  if (doc.getNumberOfPages() === 0) {
    doc.addPage();
  }

  return doc;
}

function drawPage(
  doc: jsPDF,
  input: PdfExportInput,
  prefs: Project['pdfPrefs'],
  pageIndex: number,
  pageCount: number,
  teryt: string,
  generatedAt: Date,
  summary: { treeCount: number; totalCircumference: number },
  sections: readonly PageSection[],
): void {
  drawPageHeader(doc, input.project.name, teryt, pageIndex, pageCount);

  const withMap = sections.includes('map');
  if (withMap) {
    drawMapSection(doc, prefs, sections.includes('rangesTable'), input);
  }
  if (sections.includes('rangesTable')) {
    const compact = withMap;
    drawRangesSection(doc, input, compact);
  }

  if (sections.includes('fullTable')) {
    drawNumberedSection(doc, input.project.name, teryt, input.trees);
  }

  drawFooter(doc, generatedAt, summary);
}

function drawPageHeader(
  doc: jsPDF,
  projectName: string,
  teryt: string,
  pageIndex: number,
  pageCount: number,
): void {
  doc.setDrawColor('#166534');
  doc.rect(MARGIN, MARGIN, CONTENT_W, 12, 'S');
  doc.setFontSize(14);
  doc.setTextColor('#111827');
  doc.setFont('bold');
  doc.text(projectName, MARGIN + 2, MARGIN + 8);
  doc.setFont('normal');
  doc.setFontSize(9);
  doc.setTextColor('#374151');
  doc.text(teryt, PAGE_W - MARGIN - 2, MARGIN + 8, { align: 'right' });
  doc.setFontSize(8);
  doc.setFont('bold');
  doc.text(`Strona ${String(pageIndex)}/${String(pageCount)}`, MARGIN + 2, MARGIN + 18);
  doc.setFont('normal');
  doc.setTextColor('#6b7280');
  doc.setFontSize(9);
}

function drawMapSection(
  doc: jsPDF,
  prefs: Project['pdfPrefs'],
  compact: boolean,
  input: PdfExportInput,
): void {
  const rect = compact ? MAP_RECT : MAP_RECT_FULL;
  doc.setDrawColor('#166534');
  doc.setLineWidth(0.4);
  doc.rect(rect.x, rect.y, rect.w, rect.h, 'S');

  const rings = collectMapRings(input);
  if (rings.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor('#6b7280');
    doc.text('Brak działki w projekcie', rect.x + rect.w / 2, rect.y + rect.h / 2, {
      align: 'center',
    });
    return;
  }

  const allPoints = rings.flat();
  const lat0 = midLatOf(allPoints);
  const kmRings = rings.map((ring) => toKm(ring, lat0));
  const kmPoints = kmRings.flat();
  const rotationDeg = prefs.autoRotate ? chooseRotation(kmPoints) : 0;
  const kmBbox = bboxOf(kmPoints);
  const cx = (kmBbox.minX + kmBbox.maxX) / 2;
  const cy = (kmBbox.minY + kmBbox.maxY) / 2;
  const rotatedRings = kmRings.map((ring) => rotatePoints(ring, rotationDeg, cx, cy));
  const project = makeProjector(rotatedRings.flat(), rect);

  const single = input.parcels === undefined || input.parcels.length <= 1;

  if (single) {
    doc.setDrawColor('#15803d');
    doc.setLineWidth(0.5);
    drawRingOutlines(doc, rotatedRings, project);
  } else {
    doc.setFillColor('#166534');
    for (const ring of rotatedRings) {
      if (ring.length < 2) {
        continue;
      }
      const path = ring.map((point) => project(point[0], point[1]));
      const start = path[0];
      const deltas: [number, number][] = [];
      for (let i = 0; i < path.length; i++) {
        const delta = path[(i + 1) % path.length];
        const current = path[i];
        deltas.push([delta[0] - current[0], delta[1] - current[1]]);
      }
      doc.lines(deltas, start[0], start[1], [1, 1], 'F', true);
    }
    doc.setDrawColor('#1e3a8a');
    doc.setLineWidth(0.5);
    drawRingOutlines(doc, rotatedRings, project);
  }

  doc.setTextColor('#111827');
  doc.setFontSize(6);
  input.trees.forEach((tree, index) => {
    const kmPoint = toKm([[tree.lng, tree.lat]], lat0)[0];
    const rotated = rotatePoints([kmPoint], rotationDeg, cx, cy)[0];
    const [x, y] = project(rotated[0], rotated[1]);
    const radius = markerSizeForCm(tree.circumference, prefs.markerScale) / 2;
    const clampedX = clampInside(x, rect.x + radius + 1, rect.x + rect.w - radius - 1);
    const clampedY = clampInside(y, rect.y + radius + 1, rect.y + rect.h - radius - 1);
    doc.setFillColor(getSpeciesColor(tree.species));
    doc.circle(clampedX, clampedY, radius, 'F');
    if (prefs.showNumberedTable) {
      const labelLeft = clampedX > rect.x + rect.w - 14;
      const labelX = labelLeft ? clampedX - radius - 1.4 : clampedX + radius + 1.4;
      if (labelLeft) {
        doc.text(String(index + 1), labelX, clampedY - radius - 0.8, { align: 'right' });
      } else {
        doc.text(String(index + 1), labelX, clampedY - radius - 0.8);
      }
    }
  });

  if (!single) {
    doc.setTextColor('#111827');
    doc.setFontSize(8);
    doc.setFont('bold');
    doc.text(`${String(input.parcels.length)} działki`, rect.x + 3, rect.y + 6);
    doc.setFont('normal');
  }

  drawCompass(doc, rect.x + rect.w - 10, rect.y + 10, 5, rotationDeg, prefs.autoRotate);
}

function drawCompass(
  doc: jsPDF,
  cx: number,
  cy: number,
  radius: number,
  rotationDeg: number,
  note: boolean,
): void {
  doc.setDrawColor('#111827');
  doc.setLineWidth(0.3);
  doc.circle(cx, cy, radius, 'S');
  const needle = compassNeedle(cx, cy, radius, rotationDeg);
  doc.line(needle.northX, needle.northY, cx, cy);
  doc.line(cx, cy, needle.southX, needle.southY);
  doc.setFontSize(8);
  doc.setTextColor('#111827');
  doc.text('N', needle.labelX, needle.labelY, { align: 'center' });
  if (!note) {
    return;
  }
  doc.setFontSize(7);
  doc.text('Północ prawdziwa', needle.labelX, needle.labelY + 4, { align: 'center' });
}

function drawRangesSection(doc: jsPDF, input: PdfExportInput, compact: boolean): void {
  const table = buildRangesTable(
    input.trees,
    input.project.speciesConfig,
    input.project.rangesConfig,
  );
  const titleY = compact ? MAP_RECT.y + MAP_RECT.h + 10 : 34;
  doc.setFontSize(12);
  doc.setTextColor('#111827');
  doc.setFont('bold');
  doc.text('Tabela zbiorcza — gatunek × przedziały obwodów', MARGIN, titleY);
  doc.setFont('normal');

  const columnCount = table.columns.length;
  const speciesWidth = 40;
  const totalsWidth = 18;
  const rangeWidth = (CONTENT_W - speciesWidth - totalsWidth) / Math.max(1, columnCount - 1);
  const widths = [speciesWidth, ...Array.from({ length: columnCount - 1 }, () => rangeWidth), totalsWidth];

  const header = ['Gatunek', ...table.columns];
  const rows = table.rows.map((row) => [
    row.species,
    ...row.counts.map(String),
    String(row.total),
  ]);

  drawRow(doc, header, titleY + 4, widths, true);
  rows.forEach((row, index) => {
    drawRow(doc, row, titleY + 4 + 7 * (index + 1), widths, false);
  });
}

function drawNumberedSection(
  doc: jsPDF,
  projectName: string,
  teryt: string,
  trees: readonly Tree[],
): void {
  let lastPageDrawn = doc.getNumberOfPages();
  doc.setPage(lastPageDrawn);

  doc.setFontSize(12);
  doc.setTextColor('#111827');
  doc.setFont('bold');
  doc.text('Pełna lista drzew', MARGIN, 34);
  doc.setFont('normal');

  const header = ['Nr', 'Gatunek', 'Obwód (cm)', 'Lokalizacja'];
  const widths = [10, 45, 25, CONTENT_W - 80];
  const rows = buildNumberedRows(trees);

  let y = 38;
  drawRow(doc, header, y, widths, true);
  y += 7;
  doc.setFontSize(9);
  for (const row of rows) {
    if (y > PAGE_H - 20) {
      doc.addPage();
      lastPageDrawn = doc.getNumberOfPages();
      drawPageHeader(doc, `${projectName} — pełna lista drzew (cd.)`, teryt, lastPageDrawn, lastPageDrawn);      y = 34;
      doc.setFontSize(9);
      drawRow(doc, header, y, widths, true);
      y += 7;
    }
    drawRow(
      doc,
      [String(row.nr), row.species, String(row.circumference), row.location],
      y,
      widths,
      false,
    );
    y += 7;
  }
}

function drawRow(
  doc: jsPDF,
  cells: readonly string[],
  y: number,
  widths: readonly number[],
  isHeader: boolean,
): void {
  const rowHeight = 7;
  let x = MARGIN;
  cells.forEach((cell, index) => {
    const width = widths[index] ?? 20;
    if (isHeader) {
      doc.setFillColor('#f5f5f4');
      doc.setDrawColor('#d6d3d1');
      doc.setLineWidth(0.2);
      doc.rect(x, y, width, rowHeight, 'FD');
      doc.setTextColor('#111827');
      doc.setFont('bold');
      doc.setFontSize(8);
    } else {
      doc.setDrawColor('#d6d3d1');
      doc.setLineWidth(0.2);
      doc.rect(x, y, width, rowHeight, 'S');
      doc.setTextColor('#374151');
      doc.setFont('normal');
      doc.setFontSize(9);
    }
    doc.text(cell, x + 2, y + rowHeight - 2.4, { maxWidth: width - 3 });
    x += width;
  });
  doc.setFont('normal');
}

function drawFooter(
  doc: jsPDF,
  generatedAt: Date,
  summary: { treeCount: number; totalCircumference: number },
): void {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor('#6b7280');
    doc.text(
      `Data raportu: ${formatDate(generatedAt)} · Drzew: ${String(summary.treeCount)} · Suma obwodów: ${String(summary.totalCircumference)} cm`,
      MARGIN,
      PAGE_H - 8,
    );
  }
}

export function pdfFileName(project: Project, generatedAt: Date): string {
  const date = generatedAt.toISOString().slice(0, 10);
  const slug = project.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `wycinka-${slug || 'projekt'}-${date}.pdf`;
}
