import { create } from 'zustand';
import { z } from 'zod';
import {
  addTree as addTreeToDb,
  deleteTree as deleteTreeFromDb,
  listTrees,
  updateTree as updateTreeInDb,
  type Tree,
} from '@/db/schema';
import { offsetMeters } from '@/lib/geo';

export const treeDraftSchema = z.object({
  species: z.string().min(1, 'Wybierz gatunek'),
  circumference: z
    .number({ invalid_type_error: 'Podaj obwód' })
    .positive('Obwód musi być > 0')
    .max(1000, 'Maks. 1000 cm'),
  notes: z.string().max(500, 'Maks. 500 znaków').optional(),
});

export type TreeDraftInput = z.infer<typeof treeDraftSchema>;

export interface TreeDraft {
  lat: number;
  lng: number;
  accuracy?: number;
  species: string;
  circumference: number;
  notes?: string;
  manualOffset: { dx: number; dy: number };
}

export type TreeMode = 'idle' | 'placing' | 'editing';

interface StartPlacingArgs {
  gpsPosition?: { lat: number; lng: number; accuracy?: number } | null;
  centroid?: { lat: number; lng: number } | null;
  species?: string;
}

interface TreeState {
  mode: TreeMode;
  pending: TreeDraft | null;
  trees: Tree[];
  activeProjectId: string | null;
  editingTreeId: string | null;
  selectedTreeId: string | null;
  listPanelOpen: boolean;
  setSelectedTreeId: (id: string | null) => void;
  setListPanelOpen: (open: boolean) => void;
  loadTrees: (projectId: string) => Promise<void>;
  startPlacing: (args?: StartPlacingArgs) => void;
  cancel: () => void;
  setSpecies: (species: string) => void;
  setCircumference: (circumference: number) => void;
  setNotes: (notes: string) => void;
  nudge: (dxMeters: number, dyMeters: number) => void;
  useGps: (gpsPosition: { lat: number; lng: number; accuracy?: number }) => void;
  save: (projectId: string) => Promise<Tree>;
  selectTreeForEdit: (id: string) => void;
  updateTree: (id: string, patch: Partial<TreeDraft>) => Promise<Tree>;
  deleteTree: (id: string) => Promise<void>;
  clear: () => void;
}

function emptyDraft(): TreeDraft {
  return {
    lat: 0,
    lng: 0,
    accuracy: undefined,
    species: '',
    circumference: 0,
    notes: undefined,
    manualOffset: { dx: 0, dy: 0 },
  };
}

function computeDraftPosition(draft: TreeDraft): { lat: number; lng: number } {
  const { lat, lng, manualOffset } = draft;
  if (manualOffset.dx === 0 && manualOffset.dy === 0) {
    return { lat, lng };
  }
  return offsetMeters(lat, lng, manualOffset.dx, manualOffset.dy);
}

export const useTreeStore = create<TreeState>((set, get) => ({
  mode: 'idle',
  pending: null,
  trees: [],
  activeProjectId: null,
  editingTreeId: null,
  selectedTreeId: null,
  listPanelOpen: false,

  setSelectedTreeId: (id) => {
    set({ selectedTreeId: id });
  },

  setListPanelOpen: (open) => {
    set({ listPanelOpen: open });
  },

  loadTrees: async (projectId) => {
    const trees = await listTrees(projectId);
    set({ trees, activeProjectId: projectId });
  },

  startPlacing: (args) => {
    const draft = emptyDraft();
    const gps = args?.gpsPosition ?? null;
    const centroid = args?.centroid ?? null;
    if (gps) {
      draft.lat = gps.lat;
      draft.lng = gps.lng;
      if (gps.accuracy !== undefined) {
        draft.accuracy = gps.accuracy;
      }
    } else if (centroid) {
      draft.lat = centroid.lat;
      draft.lng = centroid.lng;
    }
    if (args?.species !== undefined) {
      draft.species = args.species;
    }
    set({ mode: 'placing', pending: draft, editingTreeId: null });
  },

  cancel: () => {
    set({ mode: 'idle', pending: null, editingTreeId: null });
  },

  setSpecies: (species) => {
    const { pending } = get();
    if (pending === null) {
      return;
    }
    set({ pending: { ...pending, species } });
  },

  setCircumference: (circumference) => {
    const { pending } = get();
    if (pending === null) {
      return;
    }
    set({ pending: { ...pending, circumference } });
  },

  setNotes: (notes) => {
    const { pending } = get();
    if (pending === null) {
      return;
    }
    set({
      pending: {
        ...pending,
        notes: notes.length > 0 ? notes : undefined,
      },
    });
  },

  nudge: (dxMeters, dyMeters) => {
    const { pending } = get();
    if (pending === null) {
      return;
    }
    const newOffset = {
      dx: pending.manualOffset.dx + dxMeters,
      dy: pending.manualOffset.dy + dyMeters,
    };
    set({ pending: { ...pending, manualOffset: newOffset } });
  },

  useGps: (gpsPosition) => {
    const { pending } = get();
    if (pending === null) {
      return;
    }
    set({
      pending: {
        ...pending,
        lat: gpsPosition.lat,
        lng: gpsPosition.lng,
        accuracy: gpsPosition.accuracy,
        manualOffset: { dx: 0, dy: 0 },
      },
    });
  },

  save: async (projectId) => {
    const { pending, mode, editingTreeId } = get();
    if (pending === null) {
      throw new Error('Brak danych drzewa do zapisania');
    }
    if (mode !== 'placing' && mode !== 'editing') {
      throw new Error('Drzewo nie jest w trybie dodawania ani edycji');
    }
    const parsed = treeDraftSchema.safeParse({
      species: pending.species,
      circumference: pending.circumference,
      notes: pending.notes ?? '',
    });
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'Niepoprawne dane drzewa');
    }
    const pos = computeDraftPosition(pending);
    if (mode === 'editing' && editingTreeId !== null) {
      const updated = await updateTreeInDb(editingTreeId, {
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pending.accuracy,
        species: parsed.data.species,
        circumference: parsed.data.circumference,
        notes: parsed.data.notes ?? undefined,
        manualOffset: pending.manualOffset,
      });
      set((state) => ({
        trees: state.trees.map((t) => (t.id === updated.id ? updated : t)),
        mode: 'idle',
        pending: null,
        editingTreeId: null,
      }));
      return updated;
    }
    const tree = await addTreeToDb({
      projectId,
      lat: pos.lat,
      lng: pos.lng,
      ...(pending.accuracy !== undefined ? { accuracy: pending.accuracy } : {}),
      species: parsed.data.species,
      circumference: parsed.data.circumference,
      ...(parsed.data.notes !== undefined && parsed.data.notes.length > 0
        ? { notes: parsed.data.notes }
        : {}),
      manualOffset: pending.manualOffset,
    });
    set((state) => ({
      trees: [...state.trees, tree],
      activeProjectId: projectId,
      mode: 'idle',
      pending: null,
      editingTreeId: null,
    }));
    return tree;
  },

  selectTreeForEdit: (id): void => {
    const tree = get().trees.find((t) => t.id === id);
    if (tree === undefined) {
      return;
    }
    set({
      mode: 'editing',
      editingTreeId: id,
      pending: {
        lat: tree.lat,
        lng: tree.lng,
        ...(tree.accuracy !== undefined ? { accuracy: tree.accuracy } : {}),
        species: tree.species,
        circumference: tree.circumference,
        ...(tree.notes !== undefined ? { notes: tree.notes } : {}),
        manualOffset: tree.manualOffset ?? { dx: 0, dy: 0 },
      },
    });
  },

  updateTree: async (id, patch) => {
    const trees = get().trees;
    const tree = trees.find((t) => t.id === id);
    if (tree === undefined) {
      throw new Error(`Drzewo ${id} nie istnieje`);
    }
    const nextLat = patch.lat ?? tree.lat;
    const nextLng = patch.lng ?? tree.lng;
    const updated = await updateTreeInDb(id, {
      lat: nextLat,
      lng: nextLng,
      ...(patch.accuracy !== undefined ? { accuracy: patch.accuracy } : {}),
      ...(patch.species !== undefined ? { species: patch.species } : {}),
      ...(patch.circumference !== undefined ? { circumference: patch.circumference } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.manualOffset !== undefined ? { manualOffset: patch.manualOffset } : {}),
    });
    set((state) => ({
      trees: state.trees.map((t) => (t.id === id ? updated : t)),
    }));
    return updated;
  },

  deleteTree: async (id) => {
    await deleteTreeFromDb(id);
    set((state) => ({
      trees: state.trees.filter((t) => t.id !== id),
      selectedTreeId: state.selectedTreeId === id ? null : state.selectedTreeId,
      editingTreeId: state.editingTreeId === id ? null : state.editingTreeId,
    }));
  },

  clear: () => {
    set({
      mode: 'idle',
      pending: null,
      trees: [],
      activeProjectId: null,
      editingTreeId: null,
      selectedTreeId: null,
      listPanelOpen: false,
    });
  },
}));

export function draftPosition(draft: TreeDraft): { lat: number; lng: number } {
  return computeDraftPosition(draft);
}

export function pendingPosition(): { lat: number; lng: number } | null {
  const pending = useTreeStore.getState().pending;
  if (pending === null) {
    return null;
  }
  return computeDraftPosition(pending);
}

export async function treesForProject(projectId: string): Promise<Tree[]> {
  return listTrees(projectId);
}
