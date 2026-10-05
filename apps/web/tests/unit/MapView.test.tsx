import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MapView from '@/components/map/MapView';

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
};

vi.mock('maplibre-gl', () => {
  return {
    default: {
      Map: vi.fn().mockImplementation(() => mapInstance),
      NavigationControl: vi.fn(),
      ScaleControl: vi.fn(),
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
