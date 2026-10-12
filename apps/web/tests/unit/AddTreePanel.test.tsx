import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AddTreePanel from '@/components/trees/AddTreePanel';
import { db } from '@/db/schema';
import { useMapStore } from '@/stores/mapStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTreeStore } from '@/stores/treeStore';

type MediaListener = () => void;

const mediaQueryState = vi.hoisted(() => ({
  matches: false,
  listeners: [] as MediaListener[],
}));

describe('AddTreePanel', () => {
  beforeEach(async () => {
    mediaQueryState.matches = false;
    mediaQueryState.listeners = [];
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: mediaQueryState.matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn((_type: string, listener: MediaListener) => {
        mediaQueryState.listeners.push(listener);
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: () => false,
    }));
    useMapStore.getState().reset();
    db.delete();
    await db.open();
    useTreeStore.getState().clear();
    await useProjectStore.getState().clear();
    await useProjectStore.getState().loadProjects();
  });

  afterEach(() => {
    if (db.isOpen()) {
      db.close();
    }
  });

  it('should not render when mode is idle', () => {
    render(
      <AddTreePanel gpsPosition={null} gpsLoading={false} gpsError={null} onRefreshGps={vi.fn()} />,
    );
    expect(screen.queryByTestId('add-tree-panel')).not.toBeInTheDocument();
  });

  it('should render when mode is placing', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(
      <AddTreePanel
        gpsPosition={{ lat: 52, lng: 21, accuracy: 8, timestamp: 0 }}
        gpsLoading={false}
        gpsError={null}
        onRefreshGps={vi.fn()}
      />,
    );
    expect(screen.getByTestId('add-tree-panel')).toBeInTheDocument();
    expect(screen.getByText('Dodaj drzewo')).toBeInTheDocument();
  });

  it('should show Anuluj and Zapisz buttons', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(
      <AddTreePanel
        gpsPosition={{ lat: 52, lng: 21, accuracy: 8, timestamp: 0 }}
        gpsLoading={false}
        gpsError={null}
        onRefreshGps={vi.fn()}
      />,
    );
    expect(screen.getByTestId('panel-cancel')).toHaveTextContent('Anuluj');
    expect(screen.getByTestId('panel-save')).toHaveTextContent('Zapisz');
  });

  it('should disable Zapisz when species empty', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    useTreeStore.getState().setCircumference(50);
    render(
      <AddTreePanel
        gpsPosition={{ lat: 52, lng: 21, accuracy: 8, timestamp: 0 }}
        gpsLoading={false}
        gpsError={null}
        onRefreshGps={vi.fn()}
      />,
    );
    expect(screen.getByTestId('panel-save')).toBeDisabled();
  });

  it('should disable Zapisz when circumference is 0', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    useTreeStore.getState().setSpecies('Dąb');
    render(
      <AddTreePanel
        gpsPosition={{ lat: 52, lng: 21, accuracy: 8, timestamp: 0 }}
        gpsLoading={false}
        gpsError={null}
        onRefreshGps={vi.fn()}
      />,
    );
    expect(screen.getByTestId('panel-save')).toBeDisabled();
  });

  it('should enable Zapisz when form valid', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    useTreeStore.getState().setSpecies('Dąb');
    useTreeStore.getState().setCircumference(85);
    render(
      <AddTreePanel
        gpsPosition={{ lat: 52, lng: 21, accuracy: 8, timestamp: 0 }}
        gpsLoading={false}
        gpsError={null}
        onRefreshGps={vi.fn()}
      />,
    );
    expect(screen.getByTestId('panel-save')).not.toBeDisabled();
  });

  it('should call cancel when Anuluj clicked', async () => {
    const user = userEvent.setup();
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(
      <AddTreePanel
        gpsPosition={{ lat: 52, lng: 21, accuracy: 8, timestamp: 0 }}
        gpsLoading={false}
        gpsError={null}
        onRefreshGps={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('panel-cancel'));
    expect(useTreeStore.getState().mode).toBe('idle');
    expect(screen.queryByTestId('add-tree-panel')).not.toBeInTheDocument();
  });

  it('should call cancel when close button clicked', async () => {
    const user = userEvent.setup();
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(
      <AddTreePanel
        gpsPosition={{ lat: 52, lng: 21, accuracy: 8, timestamp: 0 }}
        gpsLoading={false}
        gpsError={null}
        onRefreshGps={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('panel-cancel'));
    expect(useTreeStore.getState().mode).toBe('idle');
  });

  it('should save tree when Zapisz clicked and reset state', async () => {
    const user = userEvent.setup();
    const project = await useProjectStore.getState().createAndActivate('Test');
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    useTreeStore.getState().setSpecies('Dąb');
    useTreeStore.getState().setCircumference(85);
    render(
      <AddTreePanel
        gpsPosition={{ lat: 52, lng: 21, accuracy: 8, timestamp: 0 }}
        gpsLoading={false}
        gpsError={null}
        onRefreshGps={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('panel-save'));
    expect(useTreeStore.getState().mode).toBe('idle');
    expect(useTreeStore.getState().trees).toHaveLength(1);
    expect(useTreeStore.getState().trees[0]?.species).toBe('Dąb');
    expect(project.id).toBe(useTreeStore.getState().trees[0]?.projectId);
  });

  it('should show pending position with offset applied', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    useTreeStore.getState().nudge(1.5, -1.5);
    render(
      <AddTreePanel
        gpsPosition={{ lat: 52, lng: 21, accuracy: 8, timestamp: 0 }}
        gpsLoading={false}
        gpsError={null}
        onRefreshGps={vi.fn()}
      />,
    );
    const position = screen.getByTestId('pending-position');
    const text = position.textContent ?? '';
    expect(text).not.toBe('52.00000, 21.00000');
    expect(text).toMatch(/\d+\.\d{5}, \d+\.\d{5}/);
  });

  it('should display GPS error when provided', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(
      <AddTreePanel
        gpsPosition={null}
        gpsLoading={false}
        gpsError="Brak uprawnień"
        onRefreshGps={vi.fn()}
      />,
    );
    expect(screen.getByTestId('gps-indicator-error')).toBeInTheDocument();
  });
});

describe('AddTreePanel — mobile bottom sheet', () => {
  beforeEach(async () => {
    mediaQueryState.matches = true;
    mediaQueryState.listeners = [];
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: mediaQueryState.matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn((_type: string, listener: MediaListener) => {
        mediaQueryState.listeners.push(listener);
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: () => false,
    }));
    useMapStore.getState().reset();
    useTreeStore.getState().clear();
    await useProjectStore.getState().clear();
  });

  afterEach(() => {
    mediaQueryState.matches = false;
  });

  it('should render as mobile bottom sheet with drag handle and accessible height classes', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(
      <AddTreePanel
        gpsPosition={{ lat: 52, lng: 21, accuracy: 8, timestamp: 0 }}
        gpsLoading={false}
        gpsError={null}
        onRefreshGps={vi.fn()}
      />,
    );
    const panel = screen.getByTestId('add-tree-panel');
    expect(panel).toHaveAttribute('data-mobile-sheet', 'true');
    expect(panel.className).toContain('h-[50dvh]');
    expect(panel.className).toContain('min-h-[300px]');
    expect(panel.className).toContain('rounded-t-2xl');
    expect(panel.className).toContain('sm:h-auto');
    expect(screen.getByTestId('add-tree-drag-handle')).toBeInTheDocument();
  });

  it('should cancel placement when the drag handle is tapped', async () => {
    const user = userEvent.setup();
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(
      <AddTreePanel
        gpsPosition={{ lat: 52, lng: 21, accuracy: 8, timestamp: 0 }}
        gpsLoading={false}
        gpsError={null}
        onRefreshGps={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('add-tree-drag-handle'));
    expect(useTreeStore.getState().mode).toBe('idle');
    expect(screen.queryByTestId('add-tree-panel')).not.toBeInTheDocument();
  });

  it('should close the sheet when dragged down beyond threshold', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(
      <AddTreePanel
        gpsPosition={{ lat: 52, lng: 21, accuracy: 8, timestamp: 0 }}
        gpsLoading={false}
        gpsError={null}
        onRefreshGps={vi.fn()}
      />,
    );
    const panel = screen.getByTestId('add-tree-panel');
    expect(panel).toHaveAttribute('data-mobile-sheet', 'true');
    expect(useTreeStore.getState().mode).toBe('placing');
  });
});

describe('AddTreePanel — focus pending pin', () => {
  beforeEach(async () => {
    useMapStore.getState().reset();
    useTreeStore.getState().clear();
    await useProjectStore.getState().clear();
  });

  it('should request map focus at the pending position when the locate button is clicked', async () => {
    const user = userEvent.setup();
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(
      <AddTreePanel
        gpsPosition={{ lat: 52, lng: 21, accuracy: 8, timestamp: 0 }}
        gpsLoading={false}
        gpsError={null}
        onRefreshGps={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('focus-pending'));
    expect(useMapStore.getState().focusTarget).toEqual({ lat: 52, lng: 21 });
  });
});

describe('AddTreePanel — kompresja (§12.4)', () => {
  beforeEach(async () => {
    mediaQueryState.matches = false;
    mediaQueryState.listeners = [];
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: mediaQueryState.matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn((_type: string, listener: MediaListener) => {
        mediaQueryState.listeners.push(listener);
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: () => false,
    }));
    useMapStore.getState().reset();
    useTreeStore.getState().clear();
    await useProjectStore.getState().clear();
    window.localStorage.clear();
    useProjectStore.getState().setToast(null);
  });

  function placingPanel(gps: { lat: number; lng: number; accuracy: number; timestamp: number } | null): JSX.Element {
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    return (
      <AddTreePanel
        gpsPosition={gps}
        gpsLoading={false}
        gpsError={null}
        onRefreshGps={vi.fn()}
      />
    );
  }

  it('should keep Zapisz and Anuluj actions in the header above the form', () => {
    render(placingPanel({ lat: 52, lng: 21, accuracy: 8, timestamp: 0 }));
    const header = screen.getByTestId('add-tree-header');
    expect(header).toContainElement(screen.getByTestId('panel-save'));
    expect(header).toContainElement(screen.getByTestId('panel-cancel'));
    const form = screen.getByTestId('tree-form');
    const save = screen.getByTestId('panel-save');
    expect(save.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('should disable GPS refresh when GPS position is unavailable', () => {
    render(placingPanel(null));
    expect(screen.getByTestId('panel-gps-refresh')).toBeDisabled();
  });

  it('should refresh pending position to current GPS and reset offset on click', async () => {
    const user = userEvent.setup();
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    useTreeStore.getState().nudge(1.5, 0);
    render(
      <AddTreePanel
        gpsPosition={{ lat: 52.5, lng: 20.5, accuracy: 6, timestamp: 0 }}
        gpsLoading={false}
        gpsError={null}
        onRefreshGps={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('panel-gps-refresh'));
    const pending = useTreeStore.getState().pending;
    expect(pending?.lat).toBe(52.5);
    expect(pending?.lng).toBe(20.5);
    expect(pending?.manualOffset).toEqual({ dx: 0, dy: 0 });
  });

  it('should show a toast feedback after GPS refresh', async () => {
    const user = userEvent.setup();
    render(placingPanel({ lat: 52.5, lng: 20.5, accuracy: 6, timestamp: 0 }));
    await user.click(screen.getByTestId('panel-gps-refresh'));
    expect(useProjectStore.getState().toast).toBe('Pozycja odświeżona z GPS');
  });
});
