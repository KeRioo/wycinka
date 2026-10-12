import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

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

describe('App routing', () => {
  it('should render the launcher start page for /', async () => {
    const { default: App } = await import('@/App');
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: /Wycinka Drzew/i })).toBeInTheDocument();
    expect(screen.getByTestId('start-new-project')).toBeInTheDocument();
  });

  it('should redirect /app to start when no project was chosen yet', async () => {
    const { default: App } = await import('@/App');
    render(
      <MemoryRouter initialEntries={['/app']}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('start-new-project')).toBeInTheDocument();
    });
  });

  it('should show the projects page for /projects', async () => {
    const { default: App } = await import('@/App');
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: /Projekty/i })).toBeInTheDocument();
  });

  it('should show NotFound for unknown routes', async () => {
    const { default: App } = await import('@/App');
    render(
      <MemoryRouter initialEntries={['/unknown-route']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText(/404/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Nie znaleziono strony/i);
  });
});
