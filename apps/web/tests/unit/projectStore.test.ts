import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/schema';
import { useProjectStore } from '@/stores/projectStore';

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
});
