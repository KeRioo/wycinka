import { z } from 'zod';
import type { PdfPrefs, Project, Tree } from '@/db/schema';
import type { PolygonGeometry } from '@/services/api.types';
import { db } from '@/db/schema';

export const BACKUP_SCHEMA_VERSION = 1;

export type BackupMode = 'overwrite' | 'merge';

export interface BackupProject {
  id: string;
  name: string;
  teryt?: string;
  polygon?: string | null;
  bbox?: [number, number, number, number];
  speciesConfig: { name: string; color: string }[];
  rangesConfig: { from: number; to: number | null; label: string }[];
  pdfPrefs: PdfPrefs;
  uldkMeta?: { fetchedAt: string; datasource: string };
  createdAt: string;
  updatedAt: string;
}

export interface BackupTree {
  id: string;
  projectId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  capturedAt: string;
  manualOffset?: { dx: number; dy: number };
  species: string;
  circumference: number;
  notes?: string;
}

export interface BackupFile {
  schemaVersion: number;
  exportedAt: string;
  projects: BackupProject[];
  trees: BackupTree[];
}

export type BackupErrorCode = 'PARSE' | 'VALIDATION' | 'UNSUPPORTED_VERSION';

export class BackupError extends Error {
  readonly code: BackupErrorCode;

  constructor(code: BackupErrorCode, message: string) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
  }
}

const pdfPrefsSchema = z.object({
  layout: z.enum(['single', 'combined', 'one-per-page']),
  markerColorBy: z.literal('species'),
  markerSizeBy: z.enum(['circumference', 'fixed']),
  markerScale: z.object({
    baseSize: z.number().nonnegative(),
    perCm: z.number(),
    maxSize: z.number().positive(),
  }),
  showNumberedTable: z.boolean(),
  tableOnSeparatePage: z.boolean(),
  autoRotate: z.boolean(),
});

const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  teryt: z.string().optional(),
  polygon: z.string().nullable().optional(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  speciesConfig: z
    .array(z.object({ name: z.string().min(1), color: z.string().min(1) }))
    .min(1),
  rangesConfig: z
    .array(z.object({ from: z.number(), to: z.number().nullable(), label: z.string().min(1) }))
    .min(1),
  pdfPrefs: pdfPrefsSchema,
  uldkMeta: z
    .object({ fetchedAt: z.string().min(1), datasource: z.string().min(1) })
    .optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const treeSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  accuracy: z.number().nonnegative().optional(),
  capturedAt: z.string().min(1),
  manualOffset: z.object({ dx: z.number(), dy: z.number() }).optional(),
  species: z.string().min(1),
  circumference: z.number().nonnegative(),
  notes: z.string().optional(),
});

const backupFileSchema = z.object({
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string().min(1),
  projects: z.array(projectSchema),
  trees: z.array(treeSchema),
});

export function projectToBackup(project: Project): BackupProject {
  return {
    id: project.id,
    name: project.name,
    ...(project.teryt !== undefined ? { teryt: project.teryt } : {}),
    ...(project.polygon !== undefined ? { polygon: JSON.stringify(project.polygon) } : {}),
    ...(project.bbox !== undefined ? { bbox: [...project.bbox] } : {}),
    speciesConfig: project.speciesConfig.map((s) => ({ ...s })),
    rangesConfig: project.rangesConfig.map((r) => ({
      from: r.from,
      to: r.to === Number.POSITIVE_INFINITY ? null : r.to,
      label: r.label,
    })),
    pdfPrefs: JSON.parse(JSON.stringify(project.pdfPrefs)) as PdfPrefs,
    ...(project.uldkMeta !== undefined ? { uldkMeta: { ...project.uldkMeta } } : {}),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function treeToBackup(tree: Tree): BackupTree {
  return {
    id: tree.id,
    projectId: tree.projectId,
    lat: tree.lat,
    lng: tree.lng,
    ...(tree.accuracy !== undefined ? { accuracy: tree.accuracy } : {}),
    capturedAt: tree.capturedAt.toISOString(),
    ...(tree.manualOffset !== undefined ? { manualOffset: { ...tree.manualOffset } } : {}),
    species: tree.species,
    circumference: tree.circumference,
    ...(tree.notes !== undefined ? { notes: tree.notes } : {}),
  };
}

function parsePolygon(raw: string | null | undefined): PolygonGeometry | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  return JSON.parse(raw) as PolygonGeometry;
}

function projectFromBackup(bp: BackupProject): Project {
  const polygonGap = parsePolygon(bp.polygon);
  return {
    id: bp.id,
    name: bp.name,
    ...(bp.teryt !== undefined ? { teryt: bp.teryt } : {}),
    ...(polygonGap !== undefined ? { polygon: polygonGap } : {}),
    ...(bp.bbox !== undefined ? { bbox: bp.bbox } : {}),
    speciesConfig: bp.speciesConfig.map((s) => ({ ...s })),
    rangesConfig: bp.rangesConfig.map((r) => ({
      from: r.from,
      to: r.to ?? Number.POSITIVE_INFINITY,
      label: r.label,
    })),
    pdfPrefs: { ...bp.pdfPrefs, markerScale: { ...bp.pdfPrefs.markerScale } },
    ...(bp.uldkMeta !== undefined ? { uldkMeta: { ...bp.uldkMeta } } : {}),
    createdAt: new Date(bp.createdAt),
    updatedAt: new Date(bp.updatedAt),
  };
}

function treeFromBackup(bt: BackupTree): Tree {
  return {
    id: bt.id,
    projectId: bt.projectId,
    lat: bt.lat,
    lng: bt.lng,
    ...(bt.accuracy !== undefined ? { accuracy: bt.accuracy } : {}),
    capturedAt: new Date(bt.capturedAt),
    ...(bt.manualOffset !== undefined ? { manualOffset: { ...bt.manualOffset } } : {}),
    species: bt.species,
    circumference: bt.circumference,
    ...(bt.notes !== undefined ? { notes: bt.notes } : {}),
  };
}

export async function exportBackup(): Promise<BackupFile> {
  const [projects, trees] = await Promise.all([db.projects.toArray(), db.trees.toArray()]);
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    projects: projects.map(projectToBackup),
    trees: trees.map(treeToBackup),
  };
}

export function downloadBackup(backup: BackupFile, fileName: string): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function parseBackup(json: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new BackupError('PARSE', 'Plik nie jest poprawnym JSON-em');
  }
  const result = backupFileSchema.safeParse(raw);
  if (!result.success) {
    const path = result.error.issues[0].path.join('.');
    throw new BackupError('VALIDATION', `Nieprawidłowa struktura pliku (pole: ${path})`);
  }
  const parsed = result.data;
  if (parsed.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupError(
      'UNSUPPORTED_VERSION',
      `Plik pochodzi z nowszej wersji schematu (${String(parsed.schemaVersion)} > ${String(BACKUP_SCHEMA_VERSION)}). Zaktualizuj aplikację.`,
    );
  }
  return parsed;
}

export interface ImportResult {
  mode: BackupMode;
  projects: number;
  trees: number;
}

export async function importBackup(backup: BackupFile, mode: BackupMode): Promise<ImportResult> {
  const projects = backup.projects.map(projectFromBackup);
  const trees = backup.trees.map(treeFromBackup);
  const revived = { projects, trees };

  if (mode === 'overwrite') {
    await db.transaction('rw', db.projects, db.trees, async () => {
      await Promise.all([db.projects.clear(), db.trees.clear()]);
      await db.projects.bulkPut(revived.projects);
      await db.trees.bulkPut(revived.trees);
    });
    return { mode, projects: revived.projects.length, trees: revived.trees.length };
  }

  const [existingProjectIds, existingTreeIds] = await Promise.all([
    db.projects.toCollection().primaryKeys(),
    db.trees.toCollection().primaryKeys(),
  ]);
  const knownProjects = new Set<string>(existingProjectIds);
  const knownTrees = new Set<string>(existingTreeIds);
  const newProjects = revived.projects.filter((p) => !knownProjects.has(p.id));
  const newTrees = revived.trees.filter((t) => !knownTrees.has(t.id));
  await db.transaction('rw', db.projects, db.trees, async () => {
    await db.projects.bulkPut(newProjects);
    await db.trees.bulkPut(newTrees);
  });
  return { mode, projects: newProjects.length, trees: newTrees.length };
}
