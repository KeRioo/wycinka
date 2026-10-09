import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BackupError,
  BACKUP_SCHEMA_VERSION,
  downloadBackup,
  exportBackup,
  importBackup,
  parseBackup,
  projectToBackup,
  treeToBackup,
} from '@/lib/backup';
import { addTree, createProject, db, listTrees, updateTree } from '@/db/schema';

describe('backup', () => {
  beforeEach(async () => {
    db.delete();
    await db.open();
  });

  afterEach(() => {
    if (db.isOpen()) {
      db.close();
    }
  });

  async function seed(): Promise<string> {
    const project = await createProject({
      name: 'Las Kozia Góra',
      teryt: '141201_1.0001.6509',
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [21.006, 52.231],
            [21.007, 52.231],
            [21.007, 52.232],
            [21.006, 52.231],
          ],
        ],
      },
    });
    await addTree({
      projectId: project.id,
      lat: 52.2314,
      lng: 21.0064,
      accuracy: 5.2,
      species: 'Dąb',
      circumference: 88,
      notes: 'Pień rozwidlony',
    });
    await addTree({
      projectId: project.id,
      lat: 52.2318,
      lng: 21.0068,
      species: 'Sosna',
      circumference: 120,
    });
    return project.id;
  }

  it('should roundtrip projects and trees through export and import', async () => {
    await seed();
    const backup = await exportBackup();

    await db.projects.clear();
    await db.trees.clear();

    const result = await importBackup(backup, 'overwrite');
    const projects = await db.projects.toArray();
    const trees = await listTrees(projects[0]?.id ?? '');

    expect(result.projects).toBe(1);
    expect(result.trees).toBe(2);
    expect(projects[0]?.name).toBe('Las Kozia Góra');
    expect(trees).toHaveLength(2);
    expect(trees[0]?.species).toBeDefined();
    const lastRange = projects[0]?.rangesConfig[projects[0]!.rangesConfig.length - 1];
    expect(lastRange?.to).toBe(Number.POSITIVE_INFINITY);
  });

  it('should serialize polygon geometry as string and revive it', async () => {
    await seed();
    const backup = await exportBackup();
    const bp = backup.projects[0];
    expect(typeof bp?.polygon).toBe('string');

    await importBackup(backup, 'overwrite');
    const projects = await db.projects.toArray();
    expect(projects[0]?.polygon).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [21.006, 52.231],
          [21.007, 52.231],
          [21.007, 52.232],
          [21.006, 52.231],
        ],
      ],
    });
  });

  it('should restore dates and pdfPrefs through roundtrip', async () => {
    await seed();
    const backup = await exportBackup();
    await db.projects.clear();
    await importBackup(backup, 'overwrite');
    const projects = await db.projects.toArray();
    expect(projects[0]?.createdAt).toBeInstanceOf(Date);
    expect(projects[0]?.pdfPrefs.layout).toBe('single');
    expect(projects[0]?.pdfPrefs.markerScale.perCm).toBeGreaterThan(0);
  });

  it('should overwrite existing data in overwrite mode', async () => {
    await seed();
    const backup = await exportBackup();
    await importBackup(backup, 'overwrite');
    await importBackup(backup, 'overwrite');
    const projects = await db.projects.toArray();
    const trees = await listTrees(projects[0]?.id ?? '');
    expect(projects).toHaveLength(1);
    expect(trees).toHaveLength(2);
  });

  it('should merge only non-existing records in merge mode', async () => {
    await seed();
    const backup = await exportBackup();
    const projectId = backup.projects[0]?.id ?? '';
    const trees = await listTrees(projectId);
    await updateTree(trees[0]?.id ?? '', { notes: 'Zmieniona lokalnie' });

    const result = await importBackup(backup, 'merge');
    const allTrees = await listTrees(projectId);
    const merged = await db.projects.toArray();

    expect(result.projects).toBe(0);
    expect(result.trees).toBe(0);
    expect(merged[0]?.name).toBe('Las Kozia Góra');
  });

  it('should deduplicate merge and keep local edits intact', async () => {
    await seed();
    const backup = await exportBackup();
    const projectId = (await db.projects.toArray())[0]?.id ?? '';
    const trees = await listTrees(projectId);
    await updateTree(trees[0]?.id ?? '', { species: 'Buk' });

    const result = await importBackup(backup, 'merge');
    const allTrees = await listTrees(projectId);
    const local = allTrees.find((t) => t.id === trees[0]?.id);

    expect(result.mode).toBe('merge');
    expect(local?.species).toBe('Buk');
  });

  it('should add only new records when merging into existing db', async () => {
    await seed();
    const backup = await exportBackup();
    const result = await importBackup(backup, 'merge');
    expect(result.trees).toBe(0);
    const projects = await db.projects.toArray();
    const trees = await listTrees(projects[0]?.id ?? '');
    expect(trees).toHaveLength(2);
  });

  it('should reject invalid JSON with PARSE error', () => {
    expect(() => parseBackup('to nie jest json')).toThrowError(BackupError);
    try {
      parseBackup('to nie jest json');
    } catch (err) {
      expect((err as BackupError).code).toBe('PARSE');
    }
  });

  it('should reject structurally invalid backup with VALIDATION error', () => {
    const invalid = JSON.stringify({ schemaVersion: 1, projects: 'x' });
    try {
      parseBackup(invalid);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BackupError);
      expect((err as BackupError).code).toBe('VALIDATION');
    }
  });

  it('should reject backup missing required pdfPrefs', () => {
    const invalid = JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-10-09T12:00:00Z',
      projects: [
        {
          id: 'p1',
          name: 'proj',
          speciesConfig: [{ name: 'Dąb', color: '#92400e' }],
          rangesConfig: [{ from: 0, to: 50, label: '< 50 cm' }],
          createdAt: '2026-10-01T10:00:00Z',
          updatedAt: '2026-10-01T10:00:00Z',
        },
      ],
      trees: [],
    });
    expect(() => parseBackup(invalid)).toThrowError(/pdfPrefs/);
  });

  it('should reject backup from newer schema version', () => {
    const future = JSON.stringify({
      schemaVersion: BACKUP_SCHEMA_VERSION + 1,
      exportedAt: '2026-10-09T12:00:00Z',
      projects: [],
      trees: [],
    });
    try {
      parseBackup(future);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as BackupError).code).toBe('UNSUPPORTED_VERSION');
      expect((err as BackupError).message).toContain('nowszej wersji');
    }
  });

  it('should expose serialized backup fields via mappers', async () => {
    await seed();
    const projects = await db.projects.toArray();
    const trees = await db.trees.toArray();
    const bp = projectToBackup(projects[0]!);
    const bt = treeToBackup(trees[0]!);

    expect(bp.teryt).toBe('141201_1.0001.6509');
    expect(bp.pdfPrefs.tableOnSeparatePage).toBe(false);
    expect(typeof bp.polygon).toBe('string');
    expect(trees.some((t) => t.species === 'Dąb')).toBe(true);
    expect(bt.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should build download blob without throwing', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });

    const backup: Parameters<typeof downloadBackup>[0] = {
      schemaVersion: 1,
      exportedAt: '2026-10-09T12:00:00Z',
      projects: [],
      trees: [],
    };
    expect(() => downloadBackup(backup, 'wycinka-backup.json')).not.toThrow();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});
