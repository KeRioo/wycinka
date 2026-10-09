import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MOCK_PARCEL_FOUND } from '@/test/mocks/api-responses';
import { useMapStore } from '@/stores/mapStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTreeStore } from '@/stores/treeStore';
import { addTree, createProject, db } from '@/db/schema';

const { mapInstance, popupMock } = vi.hoisted(() => {
  const mapInstance = {
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
  };
  const popupMock = vi.fn().mockImplementation(() => ({
    setLngLat: vi.fn().mockReturnThis(),
    setDOMContent: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  }));
  return { mapInstance, popupMock };
});

vi.mock('maplibre-gl', () => {
  const MapMock = vi.fn().mockImplementation(() => mapInstance);
  const MarkerMock = vi.fn().mockImplementation(() => ({
    setLngLat: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    getElement: vi.fn().mockReturnValue(document.createElement('div')),
  }));
  return {
    default: {
      Map: MapMock,
      NavigationControl: vi.fn(),
      ScaleControl: vi.fn(),
      Marker: MarkerMock,
      Popup: popupMock,
      addProtocol: vi.fn(),
      removeProtocol: vi.fn(),
    },
    Map: MapMock,
    Marker: MarkerMock,
    Popup: popupMock,
  };
});

vi.mock('pmtiles', () => ({
  Protocol: vi.fn().mockImplementation(() => ({ tile: vi.fn() })),
}));

import MapPage from '@/pages/MapPage';

const MOCK_PARCEL = MOCK_PARCEL_FOUND.found ? MOCK_PARCEL_FOUND.parcel : null;

function getPopupContainer(popup: Record<string, Mock>): HTMLElement {
  const firstCall = popup.setDOMContent.mock.calls[0];
  const container = firstCall?.[0];
  if (container === undefined) {
    throw new Error('setDOMContent was not called');
  }
  return container as HTMLElement;
}

function callLatestLoadHandler(): void {
  const calls = mapInstance.on.mock.calls;
  const loadCalls = calls.filter((args) => args[0] === 'load');
  const handler = loadCalls[loadCalls.length - 1]?.[1];
  if (handler === undefined) {
    throw new Error('no load handler registered');
  }
  act(() => {
    (handler as () => void)();
  });
}

async function seedProjectAndTree() {
  const project = await createProject({ name: 'P' });
  const tree = await addTree({
    projectId: project.id,
    lat: 52.23,
    lng: 21.01,
    species: 'Dąb',
    circumference: 85,
  });
  await useProjectStore.getState().loadProjects();
  await useTreeStore.getState().loadTrees(project.id);
  return { project, tree };
}

describe('MapPage', () => {
  beforeEach(() => {
    useMapStore.getState().reset();
  });

  it('should render map container and nav', () => {
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('should show loading indicator when loading', () => {
    useMapStore.getState().setLoading(true);
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Wyszukiwanie działki/i)).toBeInTheDocument();
  });

  it('should show error card when error is set', () => {
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
    useMapStore.getState().setError('Network down');
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Zamknij/i }));
    expect(useMapStore.getState().error).toBeNull();
  });

  it('should display selected parcel popup card', () => {
    if (!MOCK_PARCEL) {
      throw new Error('Mock parcel missing');
    }
    useMapStore.getState().setSelectedParcel(MOCK_PARCEL);
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(MOCK_PARCEL.teryt)).toBeInTheDocument();
  });

  it('should fit the map to the parcel bbox with maxZoom 17 when parcel is selected', () => {
    if (!MOCK_PARCEL) {
      throw new Error('Mock parcel missing');
    }
    mapInstance.fitBounds.mockClear();
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    callLatestLoadHandler();
    act(() => {
      useMapStore.getState().setSelectedParcel(MOCK_PARCEL);
    });
    expect(mapInstance.fitBounds).toHaveBeenCalledWith(
      [
        [MOCK_PARCEL.bbox[0], MOCK_PARCEL.bbox[1]],
        [MOCK_PARCEL.bbox[2], MOCK_PARCEL.bbox[3]],
      ],
      { maxZoom: 17, padding: 60, duration: 800 },
    );
    expect(mapInstance.flyTo).not.toHaveBeenCalled();
  });
});

describe('MapPage — tree list and marker popup', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    useMapStore.getState().reset();
    useProjectStore.getState().clear();
    useTreeStore.getState().clear();
  });

  afterEach(() => {
    if (db.isOpen()) {
      db.close();
    }
  });

  it('should show the tree list toggle and open the panel', async () => {
    const user = userEvent.setup();
    await seedProjectAndTree();
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    const toggle = screen.getByTestId('tree-list-toggle');
    expect(toggle).toBeInTheDocument();
    expect(screen.queryByTestId('tree-list-panel')).not.toBeInTheDocument();
    await user.click(toggle);
    expect(useTreeStore.getState().listPanelOpen).toBe(true);
    expect(screen.getByTestId('tree-list-panel')).toBeInTheDocument();
    await user.click(toggle);
    expect(useTreeStore.getState().listPanelOpen).toBe(false);
  });

  it('should select the tree and fly to it when a list row is clicked', async () => {
    const user = userEvent.setup();
    const { tree } = await seedProjectAndTree();
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    callLatestLoadHandler();
    await user.click(screen.getByTestId('tree-list-toggle'));
    const rowSelect = screen
      .getByTestId('tree-list-item')
      .querySelector('button');
    if (rowSelect === null) {
      throw new Error('row select button missing');
    }
    await user.click(rowSelect);
    expect(useTreeStore.getState().selectedTreeId).toBe(tree.id);
    expect(mapInstance.flyTo).toHaveBeenCalledWith({
      center: [tree.lng, tree.lat],
      zoom: 13,
    });
  });

  it('should render the tree popup anchored at the tree position', async () => {
    const { tree } = await seedProjectAndTree();
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    callLatestLoadHandler();
    act(() => {
      useTreeStore.getState().setSelectedTreeId(tree.id);
    });
    const instances = popupMock.mock.results.map((r) => r.value as Record<string, Mock>);
    const lastPopup = instances[instances.length - 1];
    if (lastPopup === undefined) {
      throw new Error('no popup created');
    }
    expect(lastPopup.setLngLat).toHaveBeenCalledWith([tree.lng, tree.lat]);
    const container = getPopupContainer(lastPopup);
    expect(container.querySelector('[data-testid="tree-popup"]')).not.toBeNull();
    expect(container.textContent).toContain('Dąb');
    expect(container.textContent).toContain('Obwód: 85 cm');
  });

  it('should start edit mode and close the popup when edit is clicked in the popup', async () => {
    const user = userEvent.setup();
    const { tree } = await seedProjectAndTree();
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    callLatestLoadHandler();
    act(() => {
      useTreeStore.getState().setSelectedTreeId(tree.id);
    });
    const instances = popupMock.mock.results.map((r) => r.value as Record<string, Mock>);
    const lastPopup = instances[instances.length - 1];
    if (lastPopup === undefined) {
      throw new Error('no popup created');
    }
    const container = getPopupContainer(lastPopup);
    const editButton = container.querySelector(
      '[data-testid="tree-popup-edit"]',
    )!;
    if (editButton === null) {
      throw new Error('edit button missing in popup');
    }
    await user.click(editButton);
    expect(useTreeStore.getState().mode).toBe('editing');
    expect(useTreeStore.getState().editingTreeId).toBe(tree.id);
    expect(useTreeStore.getState().selectedTreeId).toBeNull();
  });

  it('should delete the tree when delete is clicked in the popup', async () => {
    const user = userEvent.setup();
    const { tree } = await seedProjectAndTree();
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    callLatestLoadHandler();
    act(() => {
      useTreeStore.getState().setSelectedTreeId(tree.id);
    });
    const instances = popupMock.mock.results.map((r) => r.value as Record<string, Mock>);
    const lastPopup = instances[instances.length - 1];
    if (lastPopup === undefined) {
      throw new Error('no popup created');
    }
    const container = getPopupContainer(lastPopup);
    const deleteButton = container.querySelector(
      '[data-testid="tree-popup-delete"]',
    )!;
    if (deleteButton === null) {
      throw new Error('delete button missing in popup');
    }
    await user.click(deleteButton);
    await vi.waitFor(() => {
      expect(useTreeStore.getState().trees).toHaveLength(0);
    });
    await vi.waitFor(() => {
      expect(useTreeStore.getState().selectedTreeId).toBeNull();
    });
  });

  it('should open the PDF export dialog when the export button is clicked', async () => {
    const user = userEvent.setup();
    await seedProjectAndTree();
    render(
      <MemoryRouter initialEntries={['/map']}>
        <MapPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('pdf-export-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-export-dialog')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('pdf-export-toggle'));
    expect(screen.getByTestId('pdf-export-dialog')).toBeInTheDocument();
    expect(screen.getByText('Eksport PDF')).toBeInTheDocument();
  });
});
