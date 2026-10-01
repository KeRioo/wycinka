import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addTree,
  createProject,
  db,
  deleteProject,
  deleteTree,
  listProjects,
  listTrees,
  updateTree,
} from '@/db/schema';
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

  it('should expose current version constant', () => {
    expect(CURRENT_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('should run without throwing on open db', async () => {
    await expect(runMigrations(db)).resolves.not.toThrow();
  });
});
