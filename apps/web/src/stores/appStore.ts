import { create } from 'zustand';

export type AppModal = 'settings' | 'reports' | null;

interface AppState {
  appModal: AppModal;
  openAppModal: (modal: Exclude<AppModal, null>) => void;
  closeAppModal: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  appModal: null,
  openAppModal: (modal) => {
    set({ appModal: modal });
  },
  closeAppModal: () => {
    set({ appModal: null });
  },
  reset: () => {
    set({ appModal: null });
  },
}));
