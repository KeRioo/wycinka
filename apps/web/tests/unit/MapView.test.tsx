import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapView from '@/components/map/MapView';

const markerInstances: {
  setLngLat: ReturnType<typeof vi.fn>;
  addTo: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  getElement: ReturnType<typeof vi.fn>;
}[] = [];

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
  getZoom: vi.fn(),
  getCenter: vi.fn(),
  dragPan: {
    disable: vi.fn(),
    enable: vi.fn(),
  },
};

vi.mock('maplibre-gl', () => {
  return {
    default: {
      Map: vi.fn().mockImplementation(() => mapInstance),
      NavigationControl: vi.fn(),
      ScaleControl: vi.fn(),
      Marker: vi.fn().mockImplementation(() => {
        const marker = {
          setLngLat: vi.fn().mockReturnThis(),
          addTo: vi.fn().mockReturnThis(),
          remove: vi.fn(),
          getElement: vi.fn().mockReturnValue(document.createElement('div')),
        };
        markerInstances.push(marker);
        return marker;
      }),
      addProtocol: vi.fn(),
      removeProtocol: vi.fn(),
    },
  };
});

vi.mock('pmtiles', () => ({
  Protocol: vi.fn().mockImplementation(() => ({ tile: vi.fn() })),
}));

function callLoadHandlers(): void {
  const calls = mapInstance.on.mock.calls;
  for (const args of calls) {
    if (args[0] === 'load') {
      (args[1] as () => void)();
    }
  }
}

function getTreeClickHandler(): (payload: unknown) => void {
  const calls = mapInstance.on.mock.calls;
  const found = calls.find((args) => args[0] === 'click' && args[1] === 'trees-circle');
  if (found === undefined) {
    throw new Error('trees-circle click handler was not registered');
  }
  return found[2] as (payload: unknown) => void;
}

describe('MapView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markerInstances.length = 0;
  });

  it('should call onTreeClick with id and lng/lat when a tree marker is clicked', () => {
    const onTreeClick = vi.fn();
    render(<MapView pmtilesUrl="http://localhost/pmtiles/dzialki" onTreeClick={onTreeClick} />);
    act(() => {
      callLoadHandlers();
    });
    mapInstance.queryRenderedFeatures.mockReturnValue([
      {
        properties: { id: 't1', species: 'Dąb' },
        geometry: { type: 'Point', coordinates: [21.0122, 52.2297] },
      },
    ]);
    act(() => {
      getTreeClickHandler()({ point: [10, 10], preventDefault: vi.fn() });
    });
    expect(onTreeClick).toHaveBeenCalledWith('t1', { lng: 21.0122, lat: 52.2297 });
  });

  it('should not call onTreeClick when no feature is under the click point', () => {
    const onTreeClick = vi.fn();
    render(<MapView pmtilesUrl="http://localhost/pmtiles/dzialki" onTreeClick={onTreeClick} />);
    act(() => {
      callLoadHandlers();
    });
    mapInstance.queryRenderedFeatures.mockReturnValue([]);
    act(() => {
      getTreeClickHandler()({ point: [10, 10], preventDefault: vi.fn() });
    });
    expect(onTreeClick).not.toHaveBeenCalled();
  });

  it('should update the trees source data when treeLayer changes', () => {
    render(<MapView pmtilesUrl="http://localhost/pmtiles/dzialki" />);
    const source = { setData: vi.fn() };
    mapInstance.getSource.mockReturnValue(source);
    act(() => {
      callLoadHandlers();
    });
    expect(source.setData).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FeatureCollection', features: [] }),
    );
  });
});

function getLayerEventHandler(layer: string, event: string): ((payload: unknown) => void) | undefined {
  const found = mapInstance.on.mock.calls.find(
    (args) => args[0] === event && args[1] === layer,
  );
  return found?.[2] as (payload: unknown) => void;
}

function getMapEventHandler(event: string): ((payload: unknown) => void) | undefined {
  const found = mapInstance.on.mock.calls.find(
    (args) => args[0] === event && args.length === 2,
  );
  return found?.[1] as (payload: unknown) => void;
}

function dragEvent(lat: number, lng: number): unknown {
  return { lngLat: { lat, lng }, preventDefault: vi.fn() };
}

const VERTEX = { lat: 52.2297, lng: 21.0125 };

describe('MapView pending drag with snap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markerInstances.length = 0;
    mapInstance.getZoom.mockReturnValue(13);
    mapInstance.getCenter.mockReturnValue({ lat: 52.2297, lng: 21.0122 });
  });

  it('should snap dropped pending marker to a vertex within the threshold', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    render(
      <MapView
        pmtilesUrl="http://localhost/pmtiles/dzialki"
        pendingDrag={{ vertices: [VERTEX], onMove, onEnd }}
      />,
    );
    act(() => {
      callLoadHandlers();
    });
    act(() => {
      getLayerEventHandler('trees-pending-circle', 'mousedown')?.(dragEvent(52.2297, 21.01222));
    });
    act(() => {
      getMapEventHandler('mouseup')?.(dragEvent(52.2297, 21.01222));
    });
    expect(onEnd).toHaveBeenCalledWith(VERTEX);
    expect(onMove).toHaveBeenCalledWith(VERTEX);
    expect(mapInstance.dragPan.disable).toHaveBeenCalled();
    expect(mapInstance.dragPan.enable).toHaveBeenCalled();
  });

  it('should show the snap indicator on the vertex while snapping', () => {
    const onEnd = vi.fn();
    render(
      <MapView
        pmtilesUrl="http://localhost/pmtiles/dzialki"
        pendingDrag={{ vertices: [VERTEX], onMove: vi.fn(), onEnd }}
      />,
    );
    act(() => {
      callLoadHandlers();
    });
    act(() => {
      getLayerEventHandler('trees-pending-circle', 'mousedown')?.(dragEvent(52.2297, 21.01222));
    });
    expect(markerInstances.length).toBe(1);
    expect(markerInstances[0]?.setLngLat).toHaveBeenCalledWith([VERTEX.lng, VERTEX.lat]);
    expect(markerInstances[0]?.addTo).toHaveBeenCalled();
    act(() => {
      getMapEventHandler('mouseup')?.(dragEvent(52.2297, 21.01222));
    });
    expect(markerInstances[0]?.remove).toHaveBeenCalled();
  });

  it('should drop without snapping when the position is far from vertices', () => {
    const onEnd = vi.fn();
    const source = { setData: vi.fn() };
    mapInstance.getSource.mockReturnValue(source);
    render(
      <MapView
        pmtilesUrl="http://localhost/pmtiles/dzialki"
        pendingDrag={{ vertices: [VERTEX], onMove: vi.fn(), onEnd }}
      />,
    );
    act(() => {
      callLoadHandlers();
    });
    act(() => {
      getLayerEventHandler('trees-pending-circle', 'mousedown')?.(dragEvent(52.2305, 21.0122));
    });
    expect(markerInstances).toHaveLength(1);
    expect(markerInstances[0]?.addTo).not.toHaveBeenCalled();
    act(() => {
      getMapEventHandler('mouseup')?.(dragEvent(52.2305, 21.0122));
    });
    expect(onEnd).toHaveBeenCalledWith({ lat: 52.2305, lng: 21.0122 });
    const lastData = source.setData.mock.lastCall?.[0] as { features: unknown[] };
    expect(lastData.features).toHaveLength(0);
  });

  it('should not register drag handlers when pendingDrag is null', () => {
    render(<MapView pmtilesUrl="http://localhost/pmtiles/dzialki" />);
    act(() => {
      callLoadHandlers();
    });
    expect(getLayerEventHandler('trees-pending-circle', 'mousedown')).toBeUndefined();
  });
});
