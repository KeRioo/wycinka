import { create } from 'zustand';
import {
  addParcelToProjectDb,
  createProject,
  deleteProject as deleteProjectFromDb,
  listProjectParcels,
  removeParcelFromProjectDb,
  listProjects,
  MAX_PARCELS_PER_PROJECT,
  updatePdfPrefs as updatePdfPrefsInDb,
  updateRangesConfig as updateRangesConfigInDb,
  updateSpeciesConfig as updateSpeciesConfigInDb,
  renameProject as renameProjectInDb,
  type Project,
} from '@/db/schema';
import type { Parcel } from '@/services/api.types';

export type ProjectLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

const PARCEL_LIMIT_MESSAGE = `Limit ${String(MAX_PARCELS_PER_PROJECT)} działek na projekt`;

interface ProjectState {
  activeProjectId: string | null;
  projects: Project[];
  projectParcels: Parcel[];
  status: ProjectLoadStatus;
  error: string | null;
  toast: string | null;
  loadProjects: () => Promise<void>;
  loadProjectParcels: (projectId: string | null) => Promise<void>;
  addParcelToProject: (parcel: Parcel, projectId?: string) => Promise<void>;
  removeParcelFromProject: (teryt: string) => Promise<void>;
  isParcelInProject: (teryt: string) => boolean;
  setToast: (message: string | null) => void;
  setActive: (id: string | null) => void;
  createAndActivate: (name: string) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  savePdfPrefs: (id: string, prefs: Project['pdfPrefs']) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<boolean>;
  saveSpeciesConfig: (id: string, species: Project['speciesConfig']) => Promise<void>;
  saveRangesConfig: (id: string, ranges: Project['rangesConfig']) => Promise<void>;
  refresh: () => Promise<void>;
  getActive: () => Project | null;
  clear: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  activeProjectId: null,
  projects: [],
  projectParcels: [],
  status: 'idle',
  error: null,
  toast: null,

  loadProjects: async () => {
    set({ status: 'loading', error: null });
    try {
      const projects = await listProjects();
      const currentActive = get().activeProjectId;
      let nextActive: string | null = currentActive;
      if (nextActive !== null) {
        const stillExists = projects.some((p) => p.id === nextActive);
        if (!stillExists) {
          nextActive = null;
        }
      }
      if (nextActive === null && projects.length > 0) {
        nextActive = projects[0]?.id ?? null;
      }
      set({ projects, activeProjectId: nextActive, status: 'loaded' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nieznany błąd ładowania projektów';
      set({ status: 'error', error: message });
    }
  },

  loadProjectParcels: async (projectId) => {
    if (projectId === null) {
      set({ projectParcels: [] });
      return;
    }
    const rows = await listProjectParcels(projectId);
    set({ projectParcels: rows.map((row) => row.snapshot) });
  },

  addParcelToProject: async (parcel, projectId) => {
    const target = projectId ?? get().activeProjectId;
    if (target === null) {
      return;
    }
    if (get().projectParcels.some((p) => p.teryt === parcel.teryt)) {
      return;
    }
    try {
      await addParcelToProjectDb(target, parcel);
      const rows = await listProjectParcels(target);
      set({ projectParcels: rows.map((row) => row.snapshot) });
    } catch (err) {
      const message = err instanceof Error ? err.message : PARCEL_LIMIT_MESSAGE;
      set({ toast: message });
    }
  },

  removeParcelFromProject: async (teryt) => {
    const target = get().activeProjectId;
    if (target === null) {
      return;
    }
    await removeParcelFromProjectDb(target, teryt);
    set((state) => ({ projectParcels: state.projectParcels.filter((p) => p.teryt !== teryt) }));
  },

  isParcelInProject: (teryt) => {
    return get().projectParcels.some((p) => p.teryt === teryt);
  },

  setToast: (message) => {
    set({ toast: message });
  },

  setActive: (id) => {
    set({ activeProjectId: id });
  },

  createAndActivate: async (name) => {
    const project = await createProject({ name });
    set((state) => ({
      projects: [project, ...state.projects],
      activeProjectId: project.id,
      status: 'loaded',
    }));
    return project;
  },

  deleteProject: async (id) => {
    await deleteProjectFromDb(id);
    set((state) => {
      const projects = state.projects.filter((p) => p.id !== id);
      const wasActive = state.activeProjectId === id;
      let nextActive: string | null = state.activeProjectId;
      if (wasActive) {
        nextActive = projects.length > 0 ? (projects[0]?.id ?? null) : null;
      }
      return { projects, activeProjectId: nextActive, projectParcels: [] };
    });
  },

  refresh: async () => {
    await get().loadProjects();
  },

  renameProject: async (id, name) => {
    const result = await renameProjectInDb(id, name);
    if (!result.ok) {
      set({ toast: result.error });
      return false;
    }
    set((state) => ({
      projects: state.projects.map((p) => (p.id === result.project.id ? result.project : p)),
    }));
    return true;
  },

  savePdfPrefs: async (id, prefs) => {
    const updated = await updatePdfPrefsInDb(id, prefs);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
    }));
  },

  saveSpeciesConfig: async (id, species) => {
    const updated = await updateSpeciesConfigInDb(id, species);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
    }));
  },

  saveRangesConfig: async (id, ranges) => {
    const updated = await updateRangesConfigInDb(id, ranges);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
    }));
  },

  getActive: () => {
    const { activeProjectId, projects } = get();
    if (activeProjectId === null) {
      return null;
    }
    return projects.find((p) => p.id === activeProjectId) ?? null;
  },

  clear: () => {
    set({
      activeProjectId: null,
      projects: [],
      projectParcels: [],
      status: 'idle',
      error: null,
      toast: null,
    });
  },
}));

export async function ensureProjectsLoaded(): Promise<void> {
  const state = useProjectStore.getState();
  if (state.status === 'idle' || state.status === 'error') {
    await state.loadProjects();
  }
}

export async function ensureActiveProject(): Promise<Project | null> {
  await ensureProjectsLoaded();
  const state = useProjectStore.getState();
  if (state.activeProjectId !== null) {
    const active = state.projects.find((p) => p.id === state.activeProjectId);
    if (active !== undefined) {
      return active;
    }
  }
  if (state.projects.length === 0) {
    return state.createAndActivate('Mój pierwszy projekt');
  }
  const first: Project = state.projects[0];
  state.setActive(first.id);
  return first;
}
