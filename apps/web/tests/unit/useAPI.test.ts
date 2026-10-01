import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useParcelLookup } from '@/hooks/useAPI';
import { MOCK_PARCEL_FOUND } from '@/test/mocks/api-responses';
import { useMapStore } from '@/stores/mapStore';

const MOCK_PARCEL = MOCK_PARCEL_FOUND.found ? MOCK_PARCEL_FOUND.parcel : null;

describe('useParcelLookup', () => {
  it('should update store with parcel on successful lookup', async () => {
    const { result } = renderHook(() => useParcelLookup());
    await result.current.lookup(52.23, 21.01);
    await waitFor(() => {
      if (MOCK_PARCEL) {
        expect(useMapStore.getState().selectedParcel?.id).toBe(MOCK_PARCEL.id);
      }
    });
  });

  it('should set error on invalid coordinates', async () => {
    const { result } = renderHook(() => useParcelLookup());
    await result.current.lookup(91, 0);
    await waitFor(() => {
      expect(useMapStore.getState().error).toMatch(/zakresem/i);
    });
  });

  it('should clear selected parcel when not found', async () => {
    if (MOCK_PARCEL) {
      useMapStore.getState().setSelectedParcel(MOCK_PARCEL);
    }
    const { result } = renderHook(() => useParcelLookup());
    await result.current.lookup(50.0, 19.0);
    await waitFor(() => {
      expect(useMapStore.getState().selectedParcel).toBeNull();
    });
  });
});

