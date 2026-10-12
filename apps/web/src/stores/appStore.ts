import { create } from 'zustand';

export type AppModal = 'settings' | 'reports' | null;

interface AppState {
  appModal: AppModal;
  gpsModalOpen: boolean;
  openAppModal: (modal: Exclude<AppModal, null>) => void;
  closeAppModal: () => void;
  openGpsModal: () => void;
  closeGpsModal: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  appModal: null,
  gpsModalOpen: false,
  openAppModal: (modal) => {
    set({ appModal: modal });
  },
  closeAppModal: () => {
    set({ appModal: null });
  },
  openGpsModal: () => {
    set({ gpsModalOpen: true });
  },
  closeGpsModal: () => {
    set({ gpsModalOpen: false });
  },
  reset: () => {
    set({ appModal: null, gpsModalOpen: false });
  },
}));
