import { create } from 'zustand';
import type { Parcel } from '@/services/api.types';

interface MapState {
  selectedParcel: Parcel | null;
  pendingPoint: { lat: number; lng: number } | null;
  isLoading: boolean;
  error: string | null;
  highlightLayerId: string | null;
  setSelectedParcel: (parcel: Parcel | null) => void;
  setPendingPoint: (point: { lat: number; lng: number } | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHighlightLayer: (id: string | null) => void;
  reset: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  selectedParcel: null,
  pendingPoint: null,
  isLoading: false,
  error: null,
  highlightLayerId: null,
  setSelectedParcel: (parcel) => {
    set({ selectedParcel: parcel });
  },
  setPendingPoint: (point) => {
    set({ pendingPoint: point });
  },
  setLoading: (loading) => {
    set({ isLoading: loading });
  },
  setError: (error) => {
    set({ error });
  },
  setHighlightLayer: (id) => {
    set({ highlightLayerId: id });
  },
  reset: () => {
    set({
      selectedParcel: null,
      pendingPoint: null,
      isLoading: false,
      error: null,
      highlightLayerId: null,
    });
  },
}));
