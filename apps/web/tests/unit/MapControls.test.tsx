import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as MaplibreMap } from 'maplibre-gl';
import MapControls from '@/components/map/MapControls';
import { tagMaplibreControls, zoomForScale20M } from '@/components/map/mapControlUtils';
import type { GeolocationPosition } from '@/hooks/useGeolocation';

const GPS_POSITION: GeolocationPosition = {
  lat: 52.2297,
  lng: 21.0122,
  accuracy: 8,
  timestamp: 0,
};

function makeMapWithFlyTo(): { map: MaplibreMap; flyTo: ReturnType<typeof vi.fn> } {
  const flyTo = vi.fn();
  return { map: { flyTo } as unknown as MaplibreMap, flyTo };
}

describe('mapControlUtils', () => {
  it('should skip tagging when the container is unavailable', () => {
    expect(() => {
      tagMaplibreControls(null);
    }).not.toThrow();
  });

  it('should yield zoom ≈21.78 at the equator when 20 m spans 60% of a 1024×768 viewport', () => {
    expect(zoomForScale20M(1024, 768, 0)).toBeCloseTo(21.78, 2);
  });

  it('should yield zoom ≈21.08 for Warsaw on a 1024×768 viewport', () => {
    const mpp = 20 / (0.6 * 768);
    const expected = Math.log2(
      (40075016.686 * Math.cos((52.2297 * Math.PI) / 180)) / (256 * mpp),
    );
    expect(zoomForScale20M(1024, 768, 52.2297)).toBeCloseTo(expected, 10);
  });

  it('should clamp to max zoom 22 for very large viewports', () => {
    expect(zoomForScale20M(2000, 3000, 0)).toBe(22);
  });
});

describe('MapControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the red inactive button with data-active false when GPS is unavailable', () => {
    render(<MapControls map={makeMapWithFlyTo().map} position={null} onRetryGps={vi.fn()} />);
    const button = screen.getByTestId('map-scale-to-gps');
    expect(button).toHaveAttribute('data-active', 'false');
    expect(button.getAttribute('title')).toBe('Skaluj mapę do 20 m');
    expect(button.className).toContain('bg-red-600');
    expect(button).toHaveAttribute('aria-label', 'Skaluj mapę do 20 m');
  });

  it('should open the GPS troubleshoot modal when clicked without GPS', async () => {
    const user = userEvent.setup();
    render(<MapControls map={makeMapWithFlyTo().map} position={null} onRetryGps={vi.fn()} />);
    await user.click(screen.getByTestId('map-scale-to-gps'));
    await waitFor(() => {
      expect(screen.getByTestId('gps-troubleshoot-modal')).toBeInTheDocument();
    });
  });

  it('should not fly to the position when clicked without GPS', async () => {
    const user = userEvent.setup();
    const { map, flyTo } = makeMapWithFlyTo();
    render(<MapControls map={map} position={null} onRetryGps={vi.fn()} />);
    await user.click(screen.getByTestId('map-scale-to-gps'));
    expect(flyTo).not.toHaveBeenCalled();
  });

  it('should call the retry handler and close the modal when Spróbuj ponownie is clicked', async () => {
    const user = userEvent.setup();
    const onRetryGps = vi.fn();
    render(<MapControls map={makeMapWithFlyTo().map} position={null} onRetryGps={onRetryGps} />);
    await user.click(screen.getByTestId('map-scale-to-gps'));
    await user.click(screen.getByTestId('gps-troubleshoot-retry'));
    expect(onRetryGps).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByTestId('gps-troubleshoot-modal')).not.toBeInTheDocument();
    });
  });

  it('should close the modal without retry when Zamknij is clicked', async () => {
    const user = userEvent.setup();
    const onRetryGps = vi.fn();
    render(<MapControls map={makeMapWithFlyTo().map} position={null} onRetryGps={onRetryGps} />);
    await user.click(screen.getByTestId('map-scale-to-gps'));
    await user.click(screen.getByTestId('gps-troubleshoot-close'));
    expect(onRetryGps).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByTestId('gps-troubleshoot-modal')).not.toBeInTheDocument();
    });
  });

  it('should close the modal on Escape', async () => {
    const user = userEvent.setup();
    render(<MapControls map={makeMapWithFlyTo().map} position={null} onRetryGps={vi.fn()} />);
    await user.click(screen.getByTestId('map-scale-to-gps'));
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByTestId('gps-troubleshoot-modal')).not.toBeInTheDocument();
    });
  });

  it('should render the active button with data-active true and no modal when GPS is available', () => {
    render(<MapControls map={makeMapWithFlyTo().map} position={GPS_POSITION} onRetryGps={vi.fn()} />);
    const button = screen.getByTestId('map-scale-to-gps');
    expect(button).toHaveAttribute('data-active', 'true');
    expect(button.className).toContain('bg-white');
    expect(screen.queryByTestId('gps-troubleshoot-modal')).not.toBeInTheDocument();
  });

  it('should do nothing when the map is not ready yet even with GPS available', async () => {
    const user = userEvent.setup();
    const flyTo = vi.fn();
    const map = { flyTo } as unknown as MaplibreMap;
    render(<MapControls map={null} position={GPS_POSITION} onRetryGps={vi.fn()} />);
    await user.click(screen.getByTestId('map-scale-to-gps'));
    expect(flyTo).not.toHaveBeenCalled();
    expect(map).toBeDefined();
    expect(screen.queryByTestId('gps-troubleshoot-modal')).not.toBeInTheDocument();
  });

  it('should fly to the GPS position at the 20 m scale zoom when clicked with GPS', async () => {
    const user = userEvent.setup();
    const { map, flyTo } = makeMapWithFlyTo();
    render(<MapControls map={map} position={GPS_POSITION} onRetryGps={vi.fn()} />);
    await user.click(screen.getByTestId('map-scale-to-gps'));
    const mpp = 20 / (0.6 * 768);
    const expectedZoom = Math.log2(
      (40075016.686 * Math.cos((52.2297 * Math.PI) / 180)) / (256 * mpp),
    );
    expect(flyTo).toHaveBeenCalledWith({
      center: [21.0122, 52.2297],
      zoom: expectedZoom,
      duration: 500,
    });
  });
});
