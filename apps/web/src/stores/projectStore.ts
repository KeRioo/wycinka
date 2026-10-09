import { create } from 'zustand';
import {
  createProject,
  deleteProject as deleteProjectFromDb,
  listProjects,
  updatePdfPrefs as updatePdfPrefsInDb,
  updateRangesConfig as updateRangesConfigInDb,
  updateSpeciesConfig as updateSpeciesConfigInDb,
  type Project,
} from '@/db/schema';

export type ProjectLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface ProjectState {
  activeProjectId: string | null;
  projects: Project[];
  status: ProjectLoadStatus;
  error: string | null;
  loadProjects: () => Promise<void>;
  setActive: (id: string | null) => void;
  createAndActivate: (name: string) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  savePdfPrefs: (id: string, prefs: Project['pdfPrefs']) => Promise<void>;
  saveSpeciesConfig: (id: string, species: Project['speciesConfig']) => Promise<void>;
  saveRangesConfig: (id: string, ranges: Project['rangesConfig']) => Promise<void>;
  refresh: () => Promise<void>;
  getActive: () => Project | null;
  clear: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  activeProjectId: null,
  projects: [],
  status: 'idle',
  error: null,

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
      return { projects, activeProjectId: nextActive };
    });
  },

  refresh: async () => {
    await get().loadProjects();
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
      status: 'idle',
      error: null,
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
