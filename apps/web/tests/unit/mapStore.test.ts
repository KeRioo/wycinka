import { describe, expect, it } from 'vitest';
import { useMapStore } from '@/stores/mapStore';
import { MOCK_PARCEL_FOUND } from '@/test/mocks/api-responses';

const MOCK_PARCEL = MOCK_PARCEL_FOUND.found ? MOCK_PARCEL_FOUND.parcel : null;

describe('useMapStore', () => {
  it('should set selected parcel', () => {
    if (!MOCK_PARCEL) {
      throw new Error('Mock parcel missing');
    }
    useMapStore.getState().setSelectedParcel(MOCK_PARCEL);
    expect(useMapStore.getState().selectedParcel?.id).toBe(MOCK_PARCEL.id);
  });

  it('should set pending point', () => {
    useMapStore.getState().setPendingPoint({ lat: 52.23, lng: 21.01 });
    expect(useMapStore.getState().pendingPoint).toEqual({ lat: 52.23, lng: 21.01 });
  });

  it('should set and clear focus target', () => {
    useMapStore.getState().requestFocus({ lat: 52.1, lng: 21.2 });
    expect(useMapStore.getState().focusTarget).toEqual({ lat: 52.1, lng: 21.2 });
    useMapStore.getState().clearFocusTarget();
    expect(useMapStore.getState().focusTarget).toBeNull();
  });

  it('should set loading state', () => {
    useMapStore.getState().setLoading(true);
    expect(useMapStore.getState().isLoading).toBe(true);
    useMapStore.getState().setLoading(false);
    expect(useMapStore.getState().isLoading).toBe(false);
  });

  it('should set error', () => {
    useMapStore.getState().setError('Some error');
    expect(useMapStore.getState().error).toBe('Some error');
  });

  it('should set highlight layer id', () => {
    useMapStore.getState().setHighlightLayer('layer-1');
    expect(useMapStore.getState().highlightLayerId).toBe('layer-1');
  });

  it('should reset state', () => {
    if (!MOCK_PARCEL) {
      throw new Error('Mock parcel missing');
    }
    useMapStore.getState().setSelectedParcel(MOCK_PARCEL);
    useMapStore.getState().setError('err');
    useMapStore.getState().reset();
    expect(useMapStore.getState().selectedParcel).toBeNull();
    expect(useMapStore.getState().error).toBeNull();
  });
});
