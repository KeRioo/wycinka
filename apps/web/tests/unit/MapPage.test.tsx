import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MOCK_PARCEL_FOUND } from '@/test/mocks/api-responses';
import { useMapStore } from '@/stores/mapStore';

vi.mock('maplibre-gl', () => {
  const popupMock = vi.fn().mockImplementation(() => ({
    setLngLat: vi.fn().mockReturnThis(),
    setDOMContent: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  }));
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
  };
  const MapMock = vi.fn().mockImplementation(() => mapInstance);
  return {
    default: {
      Map: MapMock,
      NavigationControl: vi.fn(),
      ScaleControl: vi.fn(),
      Popup: popupMock,
      addProtocol: vi.fn(),
      removeProtocol: vi.fn(),
    },
    Map: MapMock,
    Popup: popupMock,
  };
});

vi.mock('pmtiles', () => ({
  Protocol: vi.fn().mockImplementation(() => ({ tile: vi.fn() })),
}));

const MOCK_PARCEL = MOCK_PARCEL_FOUND.found ? MOCK_PARCEL_FOUND.parcel : null;

describe('MapPage', () => {
  beforeEach(() => {
    useMapStore.getState().reset();
  });

  it('should render map container and nav', async () => {
    const { default: MapPage } = await import('@/pages/MapPage');
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('should show loading indicator when loading', async () => {
    const { default: MapPage } = await import('@/pages/MapPage');
    useMapStore.getState().setLoading(true);
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Wyszukiwanie działki/i)).toBeInTheDocument();
  });

  it('should show error card when error is set', async () => {
    const { default: MapPage } = await import('@/pages/MapPage');
    useMapStore.getState().setError('Network down');
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Network down')).toBeInTheDocument();
  });

  it('should close error when button clicked', async () => {
    const user = userEvent.setup();
    const { default: MapPage } = await import('@/pages/MapPage');
    useMapStore.getState().setError('Network down');
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Zamknij/i }));
    expect(useMapStore.getState().error).toBeNull();
  });

  it('should display selected parcel popup card', async () => {
    if (!MOCK_PARCEL) {
      throw new Error('Mock parcel missing');
    }
    const { default: MapPage } = await import('@/pages/MapPage');
    useMapStore.getState().setSelectedParcel(MOCK_PARCEL);
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(MOCK_PARCEL.teryt)).toBeInTheDocument();
  });
});
