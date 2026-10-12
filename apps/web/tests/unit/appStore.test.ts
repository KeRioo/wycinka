import { describe, expect, it } from 'vitest';
import { useAppStore } from '@/stores/appStore';

describe('useAppStore', () => {
  it('should start with no modal open', () => {
    expect(useAppStore.getState().appModal).toBeNull();
  });

  it('should open the settings modal', () => {
    useAppStore.getState().openAppModal('settings');
    expect(useAppStore.getState().appModal).toBe('settings');
  });

  it('should open the reports modal', () => {
    useAppStore.getState().openAppModal('reports');
    expect(useAppStore.getState().appModal).toBe('reports');
  });

  it('should close an open modal', () => {
    useAppStore.getState().openAppModal('settings');
    useAppStore.getState().closeAppModal();
    expect(useAppStore.getState().appModal).toBeNull();
  });

  it('should reset modal state', () => {
    useAppStore.setState({ appModal: 'reports' });
    useAppStore.getState().reset();
    expect(useAppStore.getState().appModal).toBeNull();
  });
});
