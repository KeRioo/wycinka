import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { useProjectStore } from '@/stores/projectStore';
import type { Parcel } from '@/services/api.types';

describe('useProjectStore', () => {
  beforeEach(async () => {
    db.delete();
    await db.open();
    useProjectStore.getState().clear();
  });

  afterEach(() => {
    if (db.isOpen()) {
      db.close();
    }
  });

  it('should start with empty state', () => {
    expect(useProjectStore.getState().projects).toEqual([]);
    expect(useProjectStore.getState().activeProjectId).toBeNull();
  });

  it('should loadProjects from Dexie', async () => {
    const project = await useProjectStore.getState().createAndActivate('Mój las');
    await useProjectStore.getState().loadProjects();
    const state = useProjectStore.getState();
    expect(state.projects).toHaveLength(1);
    expect(state.projects[0]?.id).toBe(project.id);
    expect(state.activeProjectId).toBe(project.id);
    expect(state.status).toBe('loaded');
  });

  it('should auto-select first project when none active', async () => {
    await useProjectStore.getState().createAndActivate('A');
    useProjectStore.setState({ activeProjectId: null });
    await useProjectStore.getState().loadProjects();
    expect(useProjectStore.getState().activeProjectId).not.toBeNull();
  });

  it('should set active project id', async () => {
    const a = await useProjectStore.getState().createAndActivate('A');
    const b = await useProjectStore.getState().createAndActivate('B');
    useProjectStore.getState().setActive(a.id);
    expect(useProjectStore.getState().activeProjectId).toBe(a.id);
    useProjectStore.getState().setActive(b.id);
    expect(useProjectStore.getState().activeProjectId).toBe(b.id);
  });

  it('should createAndActivate a project', async () => {
    const project = await useProjectStore.getState().createAndActivate('Test');
    expect(project.name).toBe('Test');
    expect(useProjectStore.getState().activeProjectId).toBe(project.id);
    expect(useProjectStore.getState().projects[0]?.id).toBe(project.id);
  });

  it('should deleteProject and also delete its trees', async () => {
    const project = await useProjectStore.getState().createAndActivate('Test');
    await db.trees.add({
      id: crypto.randomUUID(),
      projectId: project.id,
      lat: 52.23,
      lng: 21.01,
      species: 'Dąb',
      circumference: 85,
      capturedAt: new Date(),
    });

    await useProjectStore.getState().deleteProject(project.id);

    expect(useProjectStore.getState().projects).toHaveLength(0);
    expect(useProjectStore.getState().activeProjectId).toBeNull();
    const remainingTrees = await db.trees.where('projectId').equals(project.id).toArray();
    expect(remainingTrees).toHaveLength(0);
  });

  it('should reassign active project to remaining one when current is deleted', async () => {
    const a = await useProjectStore.getState().createAndActivate('A');
    const b = await useProjectStore.getState().createAndActivate('B');
    expect(useProjectStore.getState().activeProjectId).toBe(b.id);

    await useProjectStore.getState().deleteProject(b.id);

    expect(useProjectStore.getState().activeProjectId).toBe(a.id);
  });

  it('should clear state', () => {
    useProjectStore.setState({ activeProjectId: 'x', projects: [] as never });
    useProjectStore.getState().clear();
    expect(useProjectStore.getState().activeProjectId).toBeNull();
    expect(useProjectStore.getState().projects).toEqual([]);
  });

  it('should expose error when loadProjects fails', async () => {
    db.close();
    await useProjectStore.getState().loadProjects();
    expect(useProjectStore.getState().status).toBe('error');
    expect(useProjectStore.getState().error).toBeTypeOf('string');
  });

  it('should keep activeProjectId when its project still exists after reload', async () => {
    const a = await useProjectStore.getState().createAndActivate('A');
    useProjectStore.getState().setActive(a.id);
    await useProjectStore.getState().loadProjects();
    expect(useProjectStore.getState().activeProjectId).toBe(a.id);
  });

  it('should getActive return null when nothing selected', () => {
    expect(useProjectStore.getState().getActive()).toBeNull();
  });

  it('should getActive return active project', async () => {
    const p = await useProjectStore.getState().createAndActivate('X');
    const active = useProjectStore.getState().getActive();
    expect(active?.id).toBe(p.id);
  });

  it('should saveSpeciesConfig persist to Dexie and update state', async () => {
    const p = await useProjectStore.getState().createAndActivate('Las');
    const species = [
      { name: 'Modrzew', color: '#4ade80' },
      { name: 'Jodła', color: '#166534' },
    ];
    await useProjectStore.getState().saveSpeciesConfig(p.id, species);

    const stored = await db.projects.get(p.id);
    expect(stored?.speciesConfig).toEqual(species);
    expect(useProjectStore.getState().projects[0]?.speciesConfig).toEqual(species);
  });

  it('should saveRangesConfig persist to Dexie and update state', async () => {
    const p = await useProjectStore.getState().createAndActivate('Las');
    const ranges = [
      { from: 0, to: 40, label: 'małe' },
      { from: 40, to: Number.POSITIVE_INFINITY, label: 'duże' },
    ];
    await useProjectStore.getState().saveRangesConfig(p.id, ranges);

    const stored = await db.projects.get(p.id);
    expect(stored?.rangesConfig).toEqual(ranges);
    expect(useProjectStore.getState().projects[0]?.rangesConfig[1]?.to).toBe(Infinity);
  });

  it('should savePdfPrefs persist to Dexie and update state', async () => {
    const p = await useProjectStore.getState().createAndActivate('Las');
    const prefs = {
      layout: 'one-per-page' as const,
      markerColorBy: 'species' as const,
      markerSizeBy: 'fixed' as const,
      markerScale: { baseSize: 4, perCm: 0, maxSize: 20 },
      showNumberedTable: false,
      tableOnSeparatePage: true,
      autoRotate: false,
    };
    await useProjectStore.getState().savePdfPrefs(p.id, prefs);

    const stored = await db.projects.get(p.id);
    expect(stored?.pdfPrefs.layout).toBe('one-per-page');
    expect(useProjectStore.getState().projects[0]?.pdfPrefs.tableOnSeparatePage).toBe(true);
  });
});

describe('useProjectStore parcels', () => {
  const baseParcel: Parcel = {
    id: '141201_1.0001.6509',
    teryt: '141201_1.0001.6509',
    number: '6509',
    voivodeship: 'mazowieckie',
    county: 'Warszawa',
    commune: 'Śródmieście',
    region: '0001',
    region_name: 'Obręb 0001',
    area_m2: 1234.56,
    land_use: 'Ls',
    geom: { type: 'Polygon' as const, coordinates: [[[21.006, 52.231], [21.007, 52.231], [21.007, 52.232], [21.006, 52.231]]] },
    bbox: [21.006, 52.231, 21.007, 52.232] as const,
    centroid: [21.0065, 52.2315] as const,
    fetched_at: '2026-09-29T03:00:00Z',
    voivodeship_code: '14',
    county_code: '12',
    commune_code: '01',
    datasource: 'uldk',
  };

  function makeParcel(teryt: string) {
    return { ...baseParcel, id: teryt, teryt };
  }

  beforeEach(async () => {
    db.delete();
    await db.open();
    useProjectStore.getState().clear();
  });

  afterEach(() => {
    if (db.isOpen()) {
      db.close();
    }
  });

  it('should add parcel to active project and store snapshot', async () => {
    await useProjectStore.getState().createAndActivate('Las');
    await useProjectStore.getState().addParcelToProject(makeParcel('141201_1.0001.6509'));
    const state = useProjectStore.getState();
    expect(state.projectParcels).toHaveLength(1);
    expect(state.projectParcels[0]?.teryt).toBe('141201_1.0001.6509');
    expect(state.projectParcels[0]?.commune).toBe('Śródmieście');
  });

  it('should add parcel to explicitly given project', async () => {
    await useProjectStore.getState().createAndActivate('A');
    const b = await useProjectStore.getState().createAndActivate('B');
    useProjectStore.getState().setActive(b.id);
    await useProjectStore.getState().addParcelToProject(makeParcel('T1'));
    const rows = await db.project_parcels.where('projectId').equals(b.id).toArray();
    expect(rows.map((row) => row.teryt)).toEqual(['T1']);
  });

  it('should not duplicate and not overwrite when adding same teryt twice', async () => {
    await useProjectStore.getState().createAndActivate('Las');
    await useProjectStore.getState().addParcelToProject(makeParcel('T1'));
    await useProjectStore.getState().addParcelToProject(makeParcel('T1'));
    expect(useProjectStore.getState().projectParcels).toHaveLength(1);
  });

  it('should remove parcel from active project', async () => {
    await useProjectStore.getState().createAndActivate('Las');
    await useProjectStore.getState().addParcelToProject(makeParcel('T1'));
    await useProjectStore.getState().addParcelToProject(makeParcel('T2'));
    await useProjectStore.getState().removeParcelFromProject('T1');
    expect(useProjectStore.getState().projectParcels.map((p) => p.teryt)).toEqual(['T2']);
    const state = useProjectStore.getState();
    expect(state.isParcelInProject('T2')).toBe(true);
    expect(state.isParcelInProject('T1')).toBe(false);
  });

  it('should show toast error on 20-parcel limit', async () => {
    await useProjectStore.getState().createAndActivate('Las');
    for (let i = 1; i <= 20; i++) {
      await useProjectStore.getState().addParcelToProject(makeParcel(`T${String(i)}`));
    }
    await useProjectStore.getState().addParcelToProject(makeParcel('T21'));
    const state = useProjectStore.getState();
    expect(state.toast).toBe('Limit 20 działek na projekt');
    expect(state.projectParcels).toHaveLength(20);
  });

  it('should persist parcels across reload (loadProjectParcels)', async () => {
    const project = await useProjectStore.getState().createAndActivate('Las');
    await useProjectStore.getState().addParcelToProject(makeParcel('T9'));
    useProjectStore.getState().clear();
    useProjectStore.setState({ projects: [project], activeProjectId: project.id });
    await useProjectStore.getState().loadProjectParcels(project.id);
    expect(useProjectStore.getState().projectParcels.map((p) => p.teryt)).toEqual(['T9']);
  });

  it('should clear projectParcels when loading for null project', async () => {
    await useProjectStore.getState().createAndActivate('Las');
    await useProjectStore.getState().addParcelToProject(makeParcel('T1'));
    await useProjectStore.getState().loadProjectParcels(null);
    expect(useProjectStore.getState().projectParcels).toEqual([]);
  });

  it('should cascade project parcels with deleteProject', async () => {
    await useProjectStore.getState().createAndActivate('Las');
    await useProjectStore.getState().addParcelToProject(makeParcel('T1'));
    const id = useProjectStore.getState().activeProjectId!
    await useProjectStore.getState().deleteProject(id);
    expect(useProjectStore.getState().projectParcels).toHaveLength(0);
    expect(await db.project_parcels.count()).toBe(0);
  });
});

describe('useProjectStore renameProject', () => {
  beforeEach(async () => {
    db.delete();
    await db.open();
    useProjectStore.getState().clear();
  });

  afterEach(() => {
    if (db.isOpen()) {
      db.close();
    }
  });

  it('should rename project and keep it in projects list', async () => {
    const project = await useProjectStore.getState().createAndActivate('Las A');
    const ok = await useProjectStore.getState().renameProject(project.id, 'Las B');
    expect(ok).toBe(true);
    expect(useProjectStore.getState().projects[0]?.name).toBe('Las B');
    const stored = await db.projects.get(project.id);
    expect(stored?.name).toBe('Las B');
  });

  it('should set toast and not change name on invalid input', async () => {
    const project = await useProjectStore.getState().createAndActivate('Las A');
    const ok = await useProjectStore.getState().renameProject(project.id, '   ');
    expect(ok).toBe(false);
    expect(useProjectStore.getState().toast).toContain('od 1 do 100');
    expect(useProjectStore.getState().projects[0]?.name).toBe('Las A');
  });

  it('should reassign active project name while keeping active id', async () => {
    const project = await useProjectStore.getState().createAndActivate('Aktywny');
    useProjectStore.getState().setActive(project.id);
    await useProjectStore.getState().renameProject(project.id, 'Zmieniony');
    expect(useProjectStore.getState().activeProjectId).toBe(project.id);
    expect(useProjectStore.getState().getActive()?.name).toBe('Zmieniony');
  });
});
