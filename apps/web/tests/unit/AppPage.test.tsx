import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppPage from '@/pages/AppPage';
import { createProject, db } from '@/db/schema';
import { useProjectStore } from '@/stores/projectStore';

const { mapInstanceMock } = vi.hoisted(() => ({
  mapInstanceMock: {
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    addControl: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getSource: vi.fn(),
    getLayer: vi.fn(),
    getCanvas: vi.fn().mockReturnValue({ style: {} }),
    queryRenderedFeatures: vi.fn(),
    getZoom: vi.fn().mockReturnValue(13),
  },
}));

vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn().mockImplementation(() => mapInstanceMock),
    NavigationControl: vi.fn(),
    AttributionControl: vi.fn(),
    ScaleControl: vi.fn(),
    Popup: vi.fn(),
    Marker: vi.fn(),
    addProtocol: vi.fn(),
    removeProtocol: vi.fn(),
  },
  Map: vi.fn(),
  Popup: vi.fn(),
}));

vi.mock('pmtiles', () => ({
  Protocol: vi.fn().mockImplementation(() => ({ tile: vi.fn() })),
}));

vi.mock('@/hooks/useGeolocation', () => ({
  useGeolocation: vi.fn(() => ({
    position: null,
    error: null,
    loading: false,
    refresh: vi.fn(),
  })),
}));

function renderAppPage(initialPath = '/app'): void {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/app" element={<AppPage />} />
        <Route path="/" element={<div data-testid="start-marker" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppPage', () => {
  beforeEach(async () => {
    db.delete();
    await db.open();
    useProjectStore.getState().clear();
  });

  it('should redirect to start when there are no projects', async () => {
    renderAppPage();
    await waitFor(() => {
      expect(screen.getByTestId('start-marker')).toBeInTheDocument();
    });
  });

  it('should render the header and the map when a project is active', async () => {
    const project = await createProject({ name: 'Las Otwock' });
    useProjectStore.getState().setActive(project.id);
    useProjectStore.setState({ projects: [project], status: 'loaded' });
    renderAppPage();
    expect(await screen.findByTestId('app-page')).toBeInTheDocument();
    expect(screen.getByTestId('app-header')).toBeInTheDocument();
    expect(screen.getByTestId('project-chip')).toHaveTextContent('Las Otwock');
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('should auto-select the first project when reload loses the active id', async () => {
    await createProject({ name: 'Las Otwock' });
    renderAppPage();
    expect(await screen.findByTestId('app-page')).toBeInTheDocument();
    await waitFor(() => {
      expect(useProjectStore.getState().activeProjectId).not.toBeNull();
    });
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });
});
