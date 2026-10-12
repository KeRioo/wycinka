import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import GpsCrosshair from '@/components/map/GpsCrosshair';
import type { GeolocationPosition } from '@/hooks/useGeolocation';

const markers: {
  element: HTMLElement | undefined;
  setLngLat: ReturnType<typeof vi.fn>;
  addTo: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}[] = [];

vi.mock('maplibre-gl', () => ({
  default: {
    Marker: vi.fn().mockImplementation((options: { element?: HTMLElement }) => {
      const marker = {
        element: options.element,
        setLngLat: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        remove: vi.fn(),
      };
      markers.push(marker);
      return marker;
    }),
  },
}));

const POSITION_A: GeolocationPosition = {
  lat: 52.2297,
  lng: 21.0122,
  accuracy: 8,
  timestamp: 0,
};

const POSITION_B: GeolocationPosition = {
  lat: 52.2315,
  lng: 21.0065,
  accuracy: 6,
  timestamp: 1,
};

function mapMock(): unknown {
  return {};
}

function lastMarker(): (typeof markers)[number] {
  const marker = markers[markers.length - 1];
  if (marker === undefined) {
    throw new Error('no marker created');
  }
  return marker;
}

describe('GpsCrosshair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markers.length = 0;
  });

  it('should create the crosshair marker with testid when a position is available', () => {
    render(<GpsCrosshair map={mapMock() as never} position={POSITION_A} />);
    const marker = lastMarker();
    expect(marker.element?.getAttribute('data-testid')).toBe('gps-crosshair');
    expect(marker.setLngLat).toHaveBeenCalledWith([21.0122, 52.2297]);
    expect(marker.addTo).toHaveBeenCalled();
  });

  it('should update marker coordinates without recreating it when the position changes', () => {
    const map = mapMock();
    const { rerender } = render(<GpsCrosshair map={map as never} position={POSITION_A} />);
    const marker = lastMarker();
    const setLngLat: Mock = marker.setLngLat;
    setLngLat.mockClear();
    rerender(<GpsCrosshair map={map as never} position={POSITION_B} />);
    expect(markers).toHaveLength(1);
    expect(setLngLat).toHaveBeenCalledWith([21.0065, 52.2315]);
  });

  it('should not create any marker when the position is unavailable', () => {
    render(<GpsCrosshair map={mapMock() as never} position={null} />);
    expect(markers).toHaveLength(0);
  });

  it('should not create any marker when the map is unavailable', () => {
    render(<GpsCrosshair map={null} position={POSITION_A} />);
    expect(markers).toHaveLength(0);
  });

  it('should remove the marker on unmount', () => {
    const { unmount } = render(
      <GpsCrosshair map={mapMock() as never} position={POSITION_A} />,
    );
    const marker = lastMarker();
    act(() => {
      unmount();
    });
    expect(marker.remove).toHaveBeenCalled();
  });

  it('should remove the marker when the position becomes null', () => {
    const { rerender } = render(
      <GpsCrosshair map={mapMock() as never} position={POSITION_A} />,
    );
    const marker = lastMarker();
    rerender(<GpsCrosshair map={mapMock() as never} position={null} />);
    expect(marker.remove).toHaveBeenCalled();
  });
});
