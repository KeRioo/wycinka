import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapClickHandler from '@/components/map/MapClickHandler';
import { useMapStore } from '@/stores/mapStore';
import { draftPosition, useTreeStore } from '@/stores/treeStore';

const mapInstance = {
  on: vi.fn(),
  off: vi.fn(),
  remove: vi.fn(),
  flyTo: vi.fn(),
  addControl: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  getSource: vi.fn(),
  getLayer: vi.fn(),
  getCanvas: vi.fn().mockReturnValue({ style: {} }),
  queryRenderedFeatures: vi.fn(),
  getZoom: vi.fn().mockReturnValue(13),
  getCenter: vi.fn().mockReturnValue({ lat: 52.2315, lng: 21.0065 }),
  dragPan: { disable: vi.fn(), enable: vi.fn() },
};

vi.mock('maplibre-gl', () => {
  return {
    default: {
      Map: vi.fn().mockImplementation(() => mapInstance),
      NavigationControl: vi.fn(),
      ScaleControl: vi.fn(),
      Marker: vi.fn().mockImplementation(() => ({
        setLngLat: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
        getElement: vi.fn().mockReturnValue(document.createElement('div')),
      })),
      addProtocol: vi.fn(),
      removeProtocol: vi.fn(),
    },
  };
});

vi.mock('pmtiles', () => ({
  Protocol: vi.fn().mockImplementation(() => ({ tile: vi.fn() })),
}));

function getMapClickHandler(): (payload: unknown) => void {
  const found = mapInstance.on.mock.calls.filter(
    (args) => args[0] === 'click' && args.length === 2,
  ).at(-1);
  if (found === undefined) {
    throw new Error('map click handler was not registered');
  }
  return found[1] as (payload: unknown) => void;
}

const PARCEL_VERTEX = { lat: 52.231, lng: 21.006 };

describe('MapClickHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTreeStore.getState().clear();
    useMapStore.getState().reset();
  });

  it('should select the parcel on click in idle mode', async () => {
    render(<MapClickHandler />);
    act(() => {
      for (const args of mapInstance.on.mock.calls) {
        if (args[0] === 'load') {
          (args[1] as () => void)();
        }
      }
    });
    act(() => {
      getMapClickHandler()({ lngLat: { lat: 52.2315, lng: 21.0065 } });
    });
    await waitFor(() => {
      expect(useMapStore.getState().selectedParcel).not.toBeNull();
    });
  });

  it('should snap pending marker to the parcel vertex on click in placing mode', async () => {
    render(<MapClickHandler />);
    act(() => {
      for (const args of mapInstance.on.mock.calls) {
        if (args[0] === 'load') {
          (args[1] as () => void)();
        }
      }
    });
    act(() => {
      getMapClickHandler()({ lngLat: { lat: 52.2315, lng: 21.0065 } });
    });
    await waitFor(() => {
      expect(useMapStore.getState().selectedParcel).not.toBeNull();
    });
    act(() => {
      useTreeStore.getState().startPlacing({
        gpsPosition: { lat: 52.2315, lng: 21.0065, accuracy: 8 },
      });
    });
    act(() => {
      getMapClickHandler()({ lngLat: { lat: 52.231008, lng: 21.006008 } });
    });
    const pos = draftPosition(useTreeStore.getState().pending ?? useTreeStore.getState().pending)!;
    expect(pos.lat).toBeCloseTo(PARCEL_VERTEX.lat, 9);
    expect(pos.lng).toBeCloseTo(PARCEL_VERTEX.lng, 9);
  });
});
