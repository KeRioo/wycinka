import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addTree,
  createProject,
  db,
  deleteProject,
  deleteTree,
  getProject,
  listProjects,
  listTrees,
  updateTree,
  updateRangesConfig,
  updateSpeciesConfig,
  DEFAULT_PDF_PREFS,
  DEFAULT_RANGES,
  DEFAULT_SPECIES,
} from '@/db/schema';
import { normalizeProjectConfig } from '@/db/schema';
import { CURRENT_VERSION, runMigrations } from '@/db/migrations';

describe('Dexie schema', () => {
  beforeEach(async () => {
    db.delete();
    await db.open();
  });

  afterEach(() => {
    if (db.isOpen()) {
      db.close();
    }
  });

  it('should create a project with default config', async () => {
    const project = await createProject({ name: 'Test działka' });
    expect(project.id).toBeDefined();
    expect(project.name).toBe('Test działka');
    expect(project.speciesConfig.length).toBeGreaterThan(0);
    expect(project.rangesConfig.length).toBeGreaterThan(0);
    expect(project.pdfPrefs.layout).toBe('single');
  });

  it('should list projects ordered by createdAt desc', async () => {
    await createProject({ name: 'A' });
    await new Promise((r) => setTimeout(r, 5));
    await createProject({ name: 'B' });
    const projects = await listProjects();
    expect(projects.map((p) => p.name)).toEqual(['B', 'A']);
  });

  it('should add tree linked to project', async () => {
    const project = await createProject({ name: 'Test' });
    const tree = await addTree({
      projectId: project.id,
      lat: 52.23,
      lng: 21.01,
      species: 'Dąb',
      circumference: 85,
    });
    expect(tree.id).toBeDefined();
    expect(tree.capturedAt).toBeInstanceOf(Date);

    const trees = await listTrees(project.id);
    expect(trees).toHaveLength(1);
    expect(trees[0]?.species).toBe('Dąb');
  });

  it('should delete project and cascade trees', async () => {
    const project = await createProject({ name: 'Test' });
    await addTree({
      projectId: project.id,
      lat: 52.23,
      lng: 21.01,
      species: 'Sosna',
      circumference: 100,
    });
    await deleteProject(project.id);
    const trees = await listTrees(project.id);
    expect(trees).toHaveLength(0);
    const projects = await listProjects();
    expect(projects).toHaveLength(0);
  });

  it('should delete single tree', async () => {
    const project = await createProject({ name: 'Test' });
    const tree = await addTree({
      projectId: project.id,
      lat: 52.23,
      lng: 21.01,
      species: 'Buk',
      circumference: 60,
    });
    await deleteTree(tree.id);
    const trees = await listTrees(project.id);
    expect(trees).toHaveLength(0);
  });

  it('should update tree fields', async () => {
    const project = await createProject({ name: 'Test' });
    const tree = await addTree({
      projectId: project.id,
      lat: 52.23,
      lng: 21.01,
      species: 'Buk',
      circumference: 60,
    });
    const updated = await updateTree(tree.id, { species: 'Dąb', circumference: 90 });
    expect(updated.species).toBe('Dąb');
    expect(updated.circumference).toBe(90);
    expect(updated.lat).toBe(52.23);
  });

  it('should throw when updating non-existent tree', async () => {
    await expect(updateTree('does-not-exist', { species: 'X' })).rejects.toThrow();
  });
});

describe('migrations', () => {
  beforeEach(async () => {
    db.delete();
    await db.open();
  });

  afterEach(() => {
    if (db.isOpen()) {
      db.close();
    }
  });

  it('should expose current version constant matching Dexie schema version', () => {
    expect(CURRENT_VERSION).toBe(2);
    expect(db.verno).toBe(2);
  });

  it('should run without throwing on open db', async () => {
    await expect(runMigrations(db)).resolves.not.toThrow();
  });

  it('should normalize legacy project missing pdfPrefs', () => {
    const normalized = normalizeProjectConfig({
      id: 'legacy-1',
      name: 'Stary las',
      speciesConfig: undefined,
    });
    expect(normalized.pdfPrefs).toEqual(DEFAULT_PDF_PREFS);
    expect(normalized.speciesConfig).toEqual([...DEFAULT_SPECIES]);
    expect(normalized.rangesConfig).toEqual([...DEFAULT_RANGES]);
    expect(normalized.name).toBe('Stary las');
  });

  it('should keep provided config during normalization', () => {
    const pdfPrefs = { ...DEFAULT_PDF_PREFS, layout: 'combined' as const };
    const species = [{ name: 'Głóg', color: '#ff0000' }];
    const ranges = [{ from: 0, to: 100, label: 'wszystko' }];
    const normalized = normalizeProjectConfig({
      id: 'legacy-2',
      name: 'Nowy las',
      pdfPrefs,
      speciesConfig: species,
      rangesConfig: ranges,
      createdAt: new Date('2026-01-01T10:00:00Z'),
      updatedAt: new Date('2026-01-02T10:00:00Z'),
    });
    expect(normalized.pdfPrefs.layout).toBe('combined');
    expect(normalized.speciesConfig).toEqual(species);
    expect(normalized.rangesConfig).toEqual(ranges);
    expect(normalized.createdAt).toEqual(new Date('2026-01-01T10:00:00Z'));
  });

  it('should default empty species list to defaults on normalization', () => {
    const normalized = normalizeProjectConfig({
      id: 'legacy-3',
      name: 'x',
      speciesConfig: [],
    });
    expect(normalized.speciesConfig.length).toBeGreaterThan(0);
  });

  it('should normalize project with missing name', () => {
    const normalized = normalizeProjectConfig({ id: 'legacy-4' });
    expect(normalized.name).toBe('Bez nazwy');
  });
});

describe('project config updates', () => {
  beforeEach(async () => {
    db.delete();
    await db.open();
  });

  afterEach(() => {
    if (db.isOpen()) {
      db.close();
    }
  });

  async function seededProject(): Promise<string> {
    const project = await createProject({ name: 'Konfig las' });
    return project.id;
  }

  it('should update species config replacing default list', async () => {
    const id = await seededProject();
    const species = [
      { name: 'Sosna', color: '#15803d' },
      { name: 'Dąb', color: '#92400e' },
    ];
    const updated = await updateSpeciesConfig(id, species);
    const stored = await getProject(id);
    expect(updated.speciesConfig).toEqual(species);
    expect(stored?.speciesConfig).toEqual(species);
  });

  it('should update ranges config replacing default ranges', async () => {
    const id = await seededProject();
    const ranges = [
      { from: 0, to: 30, label: 'wąskie' },
      { from: 30, to: Number.POSITIVE_INFINITY, label: 'grube' },
    ];
    const updated = await updateRangesConfig(id, ranges);
    expect(updated.rangesConfig).toEqual(ranges);
  });

  it('should not touch other fields when updating config', async () => {
    const id = await seededProject();
    const before = await getProject(id);
    await updateSpeciesConfig(id, [{ name: 'Brzoza', color: '#fef3c7' }]);
    await updateRangesConfig(id, [{ from: 0, to: 999, label: 'x' }]);
    const after = await getProject(id);
    expect(after?.name).toBe('Konfig las');
    expect(after?.createdAt).toEqual(before?.createdAt);
    expect(after?.pdfPrefs).toEqual(before?.pdfPrefs);
  });

  it('should throw when updating config of non-existent project', async () => {
    await expect(updateSpeciesConfig('ghost', [])).rejects.toThrow('nie istnieje');
    await expect(updateRangesConfig('ghost', [])).rejects.toThrow('nie istnieje');
  });
});
