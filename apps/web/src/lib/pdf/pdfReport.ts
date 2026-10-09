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
  rotatePoints,
  type Rect,
} from './geometry';
import { compassNeedle } from './compass';
import { buildPdfPagePlan, type PdfPagePlan } from './pagePlan';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
const CONTENT_W = PAGE_W - MARGIN * 2;
const MAP_RECT: Rect = { x: MARGIN, y: 30, w: CONTENT_W, h: 150 };
const MAP_RECT_FULL: Rect = { x: MARGIN, y: 30, w: CONTENT_W, h: 210 };

export interface PdfExportInput {
  readonly project: Project;
  readonly trees: readonly Tree[];
  readonly prefs?: Project['pdfPrefs'];
  readonly generatedAt?: Date;
}

export type PageSection = 'map' | 'rangesTable' | 'fullTable';

export function pageSections(plan: PdfPagePlan): PageSection[] {
  return (['map', 'rangesTable', 'fullTable'] as const).filter((key) => plan[key]);
}

export function generatePdfReport(input: PdfExportInput): jsPDF {
  const prefs = input.prefs ?? input.project.pdfPrefs;
  const generatedAt = input.generatedAt ?? new Date();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const plans = buildPdfPagePlan(prefs);
  const summary = buildSummary(input.trees);
  const teryt = input.project.teryt ?? '—';

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
  doc.text(`TERYT: ${teryt}`, PAGE_W - MARGIN - 2, MARGIN + 8, { align: 'right' });
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

  const polygon = input.project.polygon;
  if (polygon === undefined) {
    doc.setFontSize(10);
    doc.setTextColor('#6b7280');
    doc.text('Brak działki w projekcie', rect.x + rect.w / 2, rect.y + rect.h / 2, {
      align: 'center',
    });
    return;
  }

  const points = polygonPoints(polygon);
  const rotationDeg = prefs.autoRotate ? chooseRotation(points) : 0;
  const bbox = bboxOf(points);
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const project = makeProjector(rotatePoints(points, rotationDeg, cx, cy), rect);

  doc.setDrawColor('#15803d');
  doc.setLineWidth(0.5);
  for (let i = 0; i < points.length; i++) {
    const a = project(points[i][0], points[i][1]);
    const next = points[(i + 1) % points.length];
    const b = project(next[0], next[1]);
    doc.line(a[0], a[1], b[0], b[1]);
  }

  doc.setTextColor('#111827');
  doc.setFontSize(6);
  input.trees.forEach((tree, index) => {
    const rotated = rotatePoints([[tree.lng, tree.lat]], rotationDeg, cx, cy)[0];
    const [x, y] = project(rotated[0], rotated[1]);
    const radius = markerSizeForCm(tree.circumference, prefs.markerScale) / 2;
    doc.setFillColor(getSpeciesColor(tree.species));
    doc.circle(x, y, radius, 'F');
    if (prefs.showNumberedTable) {
      doc.text(String(index + 1), x + radius + 1.4, y - radius - 0.8);
    }
  });

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
