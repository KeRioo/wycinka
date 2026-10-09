import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addTree, createProject, db } from '@/db/schema';
import { draftPosition, useTreeStore } from '@/stores/treeStore';

const GPS = { lat: 52.2297, lng: 21.0122, accuracy: 8 };

describe('useTreeStore', () => {
  beforeEach(async () => {
    db.delete();
    await db.open();
    useTreeStore.getState().clear();
  });

  afterEach(() => {
    if (db.isOpen()) {
      db.close();
    }
  });

  it('should start in idle mode', () => {
    expect(useTreeStore.getState().mode).toBe('idle');
    expect(useTreeStore.getState().pending).toBeNull();
    expect(useTreeStore.getState().trees).toEqual([]);
  });

  it('should startPlacing with no input creates empty draft', () => {
    useTreeStore.getState().startPlacing();
    const pending = useTreeStore.getState().pending;
    expect(pending).not.toBeNull();
    expect(pending?.species).toBe('');
    expect(pending?.lat).toBe(0);
    expect(pending?.lng).toBe(0);
    expect(useTreeStore.getState().mode).toBe('placing');
  });

  it('should startPlacing with GPS seeds position', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: GPS });
    const pending = useTreeStore.getState().pending;
    expect(pending?.lat).toBe(GPS.lat);
    expect(pending?.lng).toBe(GPS.lng);
    expect(pending?.accuracy).toBe(GPS.accuracy);
  });

  it('should startPlacing with centroid when GPS not provided', () => {
    useTreeStore.getState().startPlacing({ centroid: { lat: 52.5, lng: 21.5 } });
    const pending = useTreeStore.getState().pending;
    expect(pending?.lat).toBe(52.5);
    expect(pending?.lng).toBe(21.5);
  });

  it('should prefer GPS over centroid', () => {
    useTreeStore.getState().startPlacing({
      gpsPosition: GPS,
      centroid: { lat: 50, lng: 20 },
    });
    const pending = useTreeStore.getState().pending;
    expect(pending?.lat).toBe(GPS.lat);
    expect(pending?.lng).toBe(GPS.lng);
  });

  it('should cancel clear pending and reset mode', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: GPS });
    useTreeStore.getState().cancel();
    expect(useTreeStore.getState().mode).toBe('idle');
    expect(useTreeStore.getState().pending).toBeNull();
  });

  it('should setSpecies on pending draft', () => {
    useTreeStore.getState().startPlacing();
    useTreeStore.getState().setSpecies('Dąb');
    expect(useTreeStore.getState().pending?.species).toBe('Dąb');
  });

  it('should not setSpecies when no pending draft', () => {
    useTreeStore.getState().setSpecies('Dąb');
    expect(useTreeStore.getState().pending).toBeNull();
  });

  it('should setCircumference on pending draft', () => {
    useTreeStore.getState().startPlacing();
    useTreeStore.getState().setCircumference(85);
    expect(useTreeStore.getState().pending?.circumference).toBe(85);
  });

  it('should setNotes on pending draft', () => {
    useTreeStore.getState().startPlacing();
    useTreeStore.getState().setNotes('Duży dąb');
    expect(useTreeStore.getState().pending?.notes).toBe('Duży dąb');
  });

  it('should clear notes when empty string passed', () => {
    useTreeStore.getState().startPlacing();
    useTreeStore.getState().setNotes('Test');
    useTreeStore.getState().setNotes('');
    expect(useTreeStore.getState().pending?.notes).toBeUndefined();
  });

  it('should nudge dx and dy cumulatively', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: GPS });
    useTreeStore.getState().nudge(0.25, 0.5);
    useTreeStore.getState().nudge(0.25, -0.25);
    const offset = useTreeStore.getState().pending?.manualOffset;
    expect(offset?.dx).toBeCloseTo(0.5, 6);
    expect(offset?.dy).toBeCloseTo(0.25, 6);
  });

  it('should setPosition encode offset from GPS base so draft position matches', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: GPS });
    useTreeStore.getState().setPosition(52.22975, 21.01225);
    const pending = useTreeStore.getState().pending;
    expect(pending?.lat).toBe(GPS.lat);
    expect(pending?.lng).toBe(GPS.lng);
    const pos = draftPosition(pending!);
    expect(pos.lat).toBeCloseTo(52.22975, 9);
    expect(pos.lng).toBeCloseTo(21.01225, 9);
  });

  it('should setPosition accumulate offset relative to original base on repeated calls', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: GPS });
    useTreeStore.getState().setPosition(52.2298, 21.0123);
    useTreeStore.getState().setPosition(52.22975, 21.01225);
    const offset = useTreeStore.getState().pending?.manualOffset;
    expect(offset?.dx).toBeGreaterThan(0);
    expect(offset?.dy).toBeGreaterThan(0);
    const pos = draftPosition(useTreeStore.getState().pending!);
    expect(pos.lat).toBeCloseTo(52.22975, 9);
    expect(pos.lng).toBeCloseTo(21.01225, 9);
  });

  it('should setPosition do nothing when no pending draft', () => {
    useTreeStore.getState().setPosition(52.5, 21.5);
    expect(useTreeStore.getState().pending).toBeNull();
  });

  it('should keep offset on saved tree after setPosition', async () => {
    const project = await createProject({ name: 'P' });
    useTreeStore.getState().startPlacing({ gpsPosition: GPS });
    useTreeStore.getState().setSpecies('Dąb');
    useTreeStore.getState().setCircumference(80);
    useTreeStore.getState().setPosition(52.22975, 21.01225);
    const tree = await useTreeStore.getState().save(project.id);
    expect(tree.lat).toBeCloseTo(52.22975, 9);
    expect(tree.lng).toBeCloseTo(21.01225, 9);
    expect(tree.manualOffset?.dy).toBeCloseTo((52.22975 - GPS.lat) * 111320, 0);
  });

  it('should useGps reset offset and update position', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: GPS });
    useTreeStore.getState().nudge(5, 5);
    const newGps = { lat: 52.5, lng: 21.5, accuracy: 12 };
    useTreeStore.getState().useGps(newGps);
    const pending = useTreeStore.getState().pending;
    expect(pending?.lat).toBe(52.5);
    expect(pending?.lng).toBe(21.5);
    expect(pending?.accuracy).toBe(12);
    expect(pending?.manualOffset.dx).toBe(0);
    expect(pending?.manualOffset.dy).toBe(0);
  });

  it('should save a tree to Dexie and reset state', async () => {
    const project = await createProject({ name: 'P' });
    useTreeStore.getState().startPlacing({ gpsPosition: GPS });
    useTreeStore.getState().setSpecies('Dąb');
    useTreeStore.getState().setCircumference(85);
    const saved = await useTreeStore.getState().save(project.id);

    expect(saved.id).toBeDefined();
    expect(saved.species).toBe('Dąb');
    expect(saved.circumference).toBe(85);
    expect(saved.projectId).toBe(project.id);

    expect(useTreeStore.getState().mode).toBe('idle');
    expect(useTreeStore.getState().pending).toBeNull();
    expect(useTreeStore.getState().trees).toHaveLength(1);
  });

  it('should save a tree with offset applied to position', async () => {
    const project = await createProject({ name: 'P' });
    useTreeStore.getState().startPlacing({ gpsPosition: GPS });
    useTreeStore.getState().setSpecies('Sosna');
    useTreeStore.getState().setCircumference(50);
    useTreeStore.getState().nudge(1.5, -1.5);
    const saved = await useTreeStore.getState().save(project.id);
    expect(saved.manualOffset?.dx).toBeCloseTo(1.5, 6);
    expect(saved.manualOffset?.dy).toBeCloseTo(-1.5, 6);
    expect(saved.lat).not.toBe(GPS.lat);
    expect(saved.lng).not.toBe(GPS.lng);
  });

  it('should throw when saving with no pending draft', async () => {
    const project = await createProject({ name: 'P' });
    await expect(useTreeStore.getState().save(project.id)).rejects.toThrow(/Brak danych/i);
  });

  it('should throw when saving with invalid species', async () => {
    const project = await createProject({ name: 'P' });
    useTreeStore.getState().startPlacing({ gpsPosition: GPS });
    useTreeStore.getState().setCircumference(50);
    await expect(useTreeStore.getState().save(project.id)).rejects.toThrow(/Gatunek/i);
  });

  it('should throw when circumference is zero', async () => {
    const project = await createProject({ name: 'P' });
    useTreeStore.getState().startPlacing({ gpsPosition: GPS });
    useTreeStore.getState().setSpecies('Dąb');
    useTreeStore.getState().setCircumference(0);
    await expect(useTreeStore.getState().save(project.id)).rejects.toThrow();
  });

  it('should loadTrees from Dexie', async () => {
    const project = await createProject({ name: 'P' });
    await addTree({
      projectId: project.id,
      lat: 52.23,
      lng: 21.01,
      species: 'Dąb',
      circumference: 50,
    });
    await addTree({
      projectId: project.id,
      lat: 52.24,
      lng: 21.02,
      species: 'Sosna',
      circumference: 60,
    });
    await useTreeStore.getState().loadTrees(project.id);
    expect(useTreeStore.getState().trees).toHaveLength(2);
    expect(useTreeStore.getState().activeProjectId).toBe(project.id);
  });

  it('should deleteTree from store and Dexie', async () => {
    const project = await createProject({ name: 'P' });
    const t = await addTree({
      projectId: project.id,
      lat: 52.23,
      lng: 21.01,
      species: 'Dąb',
      circumference: 50,
    });
    await useTreeStore.getState().loadTrees(project.id);
    await useTreeStore.getState().deleteTree(t.id);
    expect(useTreeStore.getState().trees).toHaveLength(0);
  });

  it('should setSelectedTreeId update selected tree id', () => {
    useTreeStore.getState().setSelectedTreeId('t1');
    expect(useTreeStore.getState().selectedTreeId).toBe('t1');
    useTreeStore.getState().setSelectedTreeId(null);
    expect(useTreeStore.getState().selectedTreeId).toBeNull();
  });

  it('should setListPanelOpen toggle the list panel', () => {
    expect(useTreeStore.getState().listPanelOpen).toBe(false);
    useTreeStore.getState().setListPanelOpen(true);
    expect(useTreeStore.getState().listPanelOpen).toBe(true);
    useTreeStore.getState().setListPanelOpen(false);
    expect(useTreeStore.getState().listPanelOpen).toBe(false);
  });

  it('should clear selectedTreeId and editingTreeId when deleting the selected tree', async () => {
    const project = await createProject({ name: 'P' });
    const t = await addTree({
      projectId: project.id,
      lat: 52.23,
      lng: 21.01,
      species: 'Dąb',
      circumference: 50,
    });
    await useTreeStore.getState().loadTrees(project.id);
    useTreeStore.getState().setSelectedTreeId(t.id);
    await useTreeStore.getState().selectTreeForEdit(t.id);
    await useTreeStore.getState().deleteTree(t.id);
    expect(useTreeStore.getState().selectedTreeId).toBeNull();
    expect(useTreeStore.getState().editingTreeId).toBeNull();
  });

  it('should keep selectedTreeId when deleting a different tree', async () => {
    const project = await createProject({ name: 'P' });
    const t1 = await addTree({
      projectId: project.id,
      lat: 52.23,
      lng: 21.01,
      species: 'Dąb',
      circumference: 50,
    });
    const t2 = await addTree({
      projectId: project.id,
      lat: 52.24,
      lng: 21.02,
      species: 'Buk',
      circumference: 60,
    });
    await useTreeStore.getState().loadTrees(project.id);
    useTreeStore.getState().setSelectedTreeId(t2.id);
    await useTreeStore.getState().deleteTree(t1.id);
    expect(useTreeStore.getState().selectedTreeId).toBe(t2.id);
  });

  it('should selectTreeForEdit populate pending from existing tree', async () => {
    const project = await createProject({ name: 'P' });
    const t = await addTree({
      projectId: project.id,
      lat: 52.23,
      lng: 21.01,
      accuracy: 10,
      species: 'Dąb',
      circumference: 80,
      notes: 'Stary',
      manualOffset: { dx: 1, dy: 2 },
    });
    await useTreeStore.getState().loadTrees(project.id);
    await useTreeStore.getState().selectTreeForEdit(t.id);
    const state = useTreeStore.getState();
    expect(state.mode).toBe('editing');
    expect(state.editingTreeId).toBe(t.id);
    expect(state.pending?.species).toBe('Dąb');
    expect(state.pending?.circumference).toBe(80);
    expect(state.pending?.notes).toBe('Stary');
    expect(state.pending?.manualOffset.dx).toBe(1);
    expect(state.pending?.manualOffset.dy).toBe(2);
  });

  it('should save in editing mode update existing tree', async () => {
    const project = await createProject({ name: 'P' });
    const t = await addTree({
      projectId: project.id,
      lat: 52.23,
      lng: 21.01,
      species: 'Dąb',
      circumference: 50,
    });
    await useTreeStore.getState().loadTrees(project.id);
    await useTreeStore.getState().selectTreeForEdit(t.id);
    useTreeStore.getState().setCircumference(99);
    useTreeStore.getState().setSpecies('Buk');
    const updated = await useTreeStore.getState().save(project.id);
    expect(updated.id).toBe(t.id);
    expect(updated.circumference).toBe(99);
    expect(updated.species).toBe('Buk');
    expect(useTreeStore.getState().trees).toHaveLength(1);
    expect(useTreeStore.getState().trees[0]?.id).toBe(t.id);
  });

  it('should clear state', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: GPS });
    useTreeStore.getState().setSelectedTreeId('t1');
    useTreeStore.getState().setListPanelOpen(true);
    useTreeStore.getState().clear();
    expect(useTreeStore.getState().mode).toBe('idle');
    expect(useTreeStore.getState().pending).toBeNull();
    expect(useTreeStore.getState().trees).toEqual([]);
    expect(useTreeStore.getState().selectedTreeId).toBeNull();
    expect(useTreeStore.getState().listPanelOpen).toBe(false);
  });
});
