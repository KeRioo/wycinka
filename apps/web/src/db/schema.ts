import Dexie, { type Table } from 'dexie';
import type { Geometry } from '@/services/api.types';

export interface PdfPrefs {
  layout: 'single' | 'combined' | 'one-per-page';
  markerColorBy: 'species';
  markerSizeBy: 'circumference' | 'fixed';
  markerScale: { baseSize: number; perCm: number; maxSize: number };
  showNumberedTable: boolean;
  tableOnSeparatePage: boolean;
  autoRotate: boolean;
}

export interface SpeciesConfig {
  name: string;
  color: string;
}

export interface RangeConfig {
  from: number;
  to: number;
  label: string;
}

export interface UldkMeta {
  fetchedAt: string;
  datasource: string;
}

export interface Project {
  id: string;
  name: string;
  teryt?: string;
  polygon?: Geometry;
  bbox?: readonly [number, number, number, number];
  speciesConfig: SpeciesConfig[];
  rangesConfig: RangeConfig[];
  pdfPrefs: PdfPrefs;
  uldkMeta?: UldkMeta;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tree {
  id: string;
  projectId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  capturedAt: Date;
  manualOffset?: { dx: number; dy: number };
  species: string;
  circumference: number;
  notes?: string;
}

export class WycinkaDB extends Dexie {
  projects!: Table<Project, string>;
  trees!: Table<Tree, string>;

  constructor() {
    super('wycinka');
    this.version(1).stores({
      projects: 'id, name, createdAt, updatedAt',
      trees: 'id, projectId, species, capturedAt',
    });
    this.version(2)
      .stores({
        projects: 'id, name, createdAt, updatedAt',
        trees: 'id, projectId, species, capturedAt',
      })
      .upgrade(async (tx) => {
        await tx.table('projects').toCollection().modify((raw: unknown) => {
          if (isProjectLike(raw)) {
            return normalizeProjectConfig(raw);
          }
          return raw;
        });
      });
  }
}

function isProjectLike(raw: unknown): raw is { id: string } {
  return typeof raw === 'object' && raw !== null && 'id' in raw;
}

export function normalizeProjectConfig(project: Partial<Project> & { id: string }): Project {
  return {
    id: project.id,
    name: typeof project.name === 'string' ? project.name : 'Bez nazwy',
    ...(project.teryt !== undefined ? { teryt: project.teryt } : {}),
    ...(project.polygon !== undefined ? { polygon: project.polygon } : {}),
    ...(project.bbox !== undefined ? { bbox: project.bbox } : {}),
    speciesConfig: Array.isArray(project.speciesConfig) && project.speciesConfig.length > 0
      ? project.speciesConfig
      : [...DEFAULT_SPECIES],
    rangesConfig: Array.isArray(project.rangesConfig) && project.rangesConfig.length > 0
      ? project.rangesConfig
      : [...DEFAULT_RANGES],
    pdfPrefs: { ...DEFAULT_PDF_PREFS, ...project.pdfPrefs },
    ...(project.uldkMeta !== undefined ? { uldkMeta: project.uldkMeta } : {}),
    createdAt: project.createdAt ?? new Date(0),
    updatedAt: new Date(),
  };
}

export const DEFAULT_SPECIES: readonly SpeciesConfig[] = [
  { name: 'Dąb', color: '#92400e' },
  { name: 'Buk', color: '#78350f' },
  { name: 'Sosna', color: '#15803d' },
  { name: 'Świerk', color: '#14532d' },
  { name: 'Jodła', color: '#166534' },
  { name: 'Modrzew', color: '#4ade80' },
  { name: 'Brzoza', color: '#fef3c7' },
  { name: 'Olsza', color: '#854d0e' },
  { name: 'Topola', color: '#65a30d' },
  { name: 'Wierzba', color: '#a3e635' },
  { name: 'Lipa', color: '#86efac' },
  { name: 'Klon', color: '#bbf7d0' },
  { name: 'Jesion', color: '#365314' },
  { name: 'Grab', color: '#facc15' },
  { name: 'Jarzębina', color: '#dc2626' },
  { name: 'Robinia (akacja)', color: '#fde68a' },
  { name: 'Inne', color: '#6b7280' },
];

export const DEFAULT_RANGES: readonly RangeConfig[] = [
  { from: 0, to: 50, label: '< 50 cm' },
  { from: 50, to: 75, label: '50–75 cm' },
  { from: 75, to: 100, label: '75–100 cm' },
  { from: 100, to: 125, label: '100–125 cm' },
  { from: 125, to: 150, label: '125–150 cm' },
  { from: 150, to: 200, label: '150–200 cm' },
  { from: 200, to: Number.POSITIVE_INFINITY, label: '> 200 cm' },
];

export const DEFAULT_PDF_PREFS: PdfPrefs = {
  layout: 'single',
  markerColorBy: 'species',
  markerSizeBy: 'circumference',
  markerScale: { baseSize: 3, perCm: 0.06, maxSize: 18 },
  showNumberedTable: true,
  tableOnSeparatePage: false,
  autoRotate: true,
};

export const db = new WycinkaDB();

export async function createProject(input: {
  name: string;
  teryt?: string;
  polygon?: Geometry;
}): Promise<Project> {
  const now = new Date();
  const project: Project = {
    id: crypto.randomUUID(),
    name: input.name,
    speciesConfig: [...DEFAULT_SPECIES],
    rangesConfig: [...DEFAULT_RANGES],
    pdfPrefs: { ...DEFAULT_PDF_PREFS },
    createdAt: now,
    updatedAt: now,
    ...(input.teryt !== undefined ? { teryt: input.teryt } : {}),
    ...(input.polygon !== undefined ? { polygon: input.polygon } : {}),
  };
  await db.projects.add(project);
  return project;
}

export async function listProjects(): Promise<Project[]> {
  return db.projects.orderBy('createdAt').reverse().toArray();
}

export async function getProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id);
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.trees, async () => {
    await db.trees.where('projectId').equals(id).delete();
    await db.projects.delete(id);
  });
}

export async function addTree(tree: Omit<Tree, 'id' | 'capturedAt'> & { capturedAt?: Date }): Promise<Tree> {
  const fullTree: Tree = {
    ...tree,
    id: crypto.randomUUID(),
    capturedAt: tree.capturedAt ?? new Date(),
  };
  await db.trees.add(fullTree);
  return fullTree;
}

export async function listTrees(projectId: string): Promise<Tree[]> {
  return db.trees.where('projectId').equals(projectId).toArray();
}

export type TreeUpdate = Partial<Omit<Tree, 'id' | 'projectId' | 'capturedAt'>>;

export async function updateTree(id: string, patch: TreeUpdate): Promise<Tree> {
  const existing = await db.trees.get(id);
  if (existing === undefined) {
    throw new Error(`Drzewo ${id} nie istnieje`);
  }
  const next: Tree = { ...existing, ...patch };
  await db.trees.put(next);
  return next;
}

export async function updatePdfPrefs(id: string, prefs: PdfPrefs): Promise<Project> {
  const existing = await db.projects.get(id);
  if (existing === undefined) {
    throw new Error(`Projekt ${id} nie istnieje`);
  }
  const next: Project = { ...existing, pdfPrefs: prefs, updatedAt: new Date() };
  await db.projects.put(next);
  return next;
}

export async function updateSpeciesConfig(id: string, species: SpeciesConfig[]): Promise<Project> {
  const existing = await db.projects.get(id);
  if (existing === undefined) {
    throw new Error(`Projekt ${id} nie istnieje`);
  }
  const next: Project = { ...existing, speciesConfig: species, updatedAt: new Date() };
  await db.projects.put(next);
  return next;
}

export async function updateRangesConfig(id: string, ranges: RangeConfig[]): Promise<Project> {
  const existing = await db.projects.get(id);
  if (existing === undefined) {
    throw new Error(`Projekt ${id} nie istnieje`);
  }
  const next: Project = { ...existing, rangesConfig: ranges, updatedAt: new Date() };
  await db.projects.put(next);
  return next;
}

export async function deleteTree(id: string): Promise<void> {
  await db.trees.delete(id);
}
