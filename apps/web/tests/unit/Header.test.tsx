import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Header from '@/components/layout/Header';
import { useProjectStore } from '@/stores/projectStore';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/db/schema';

vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn(),
    NavigationControl: vi.fn(),
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

describe('Header (aplikacja)', () => {
  beforeEach(async () => {
    db.delete();
    await db.open();
    useProjectStore.getState().clear();
    useAppStore.getState().reset();
  });

  it('should show the project chip with the active project name', async () => {
    const created = await useProjectStore.getState().createAndActivate('Las Otwock');
    useProjectStore.getState().setActive(created.id);
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('project-chip')).toHaveTextContent('Las Otwock');
  });

  it('should render the app menu button without a chip when no project is active', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('app-menu')).toBeInTheDocument();
    expect(screen.queryByTestId('project-chip')).not.toBeInTheDocument();
  });

  it('should open the popup menu with settings, reports and exit items', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('app-menu'));
    expect(screen.getByTestId('menu-settings')).toBeInTheDocument();
    expect(screen.getByTestId('menu-reports')).toBeInTheDocument();
    expect(screen.getByTestId('menu-exit')).toBeInTheDocument();
  });

  it('should open the settings modal from the menu', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('app-menu'));
    await user.click(screen.getByTestId('menu-settings'));
    expect(useAppStore.getState().appModal).toBe('settings');
  });

  it('should open the reports modal from the menu', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('app-menu'));
    await user.click(screen.getByTestId('menu-reports'));
    expect(useAppStore.getState().appModal).toBe('reports');
  });

  it('should navigate to start when exit is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app" element={<Header />} />
          <Route path="/" element={<div data-testid="start-marker" />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('app-menu'));
    await user.click(screen.getByTestId('menu-exit'));
    await waitFor(() => {
      expect(screen.getByTestId('start-marker')).toBeInTheDocument();
    });
  });

  it('should close the menu when clicking outside', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('app-menu'));
    expect(screen.getByTestId('app-menu-panel')).toBeInTheDocument();
    await user.click(document.body);
    await waitFor(() => {
      expect(screen.queryByTestId('app-menu-panel')).not.toBeInTheDocument();
    });
  });

  it('should close the menu on Escape', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId('app-menu'));
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByTestId('app-menu-panel')).not.toBeInTheDocument();
    });
  });

  it('should render touch-sized menu button (>= 44px)', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('app-menu')).toHaveClass('h-11', 'w-11');
  });

  it('should not auto-open menu on mount', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('app-menu-panel')).not.toBeInTheDocument();
  });
});
