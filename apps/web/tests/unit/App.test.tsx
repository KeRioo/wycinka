import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn(),
    NavigationControl: vi.fn(),
    ScaleControl: vi.fn(),
    Popup: vi.fn(),
    addProtocol: vi.fn(),
    removeProtocol: vi.fn(),
  },
  Map: vi.fn(),
}));

vi.mock('pmtiles', () => ({
  Protocol: vi.fn().mockImplementation(() => ({ tile: vi.fn() })),
}));

describe('App routing', () => {
  it('should render HomePage for / route', async () => {
    const { default: App } = await import('@/App');
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Wycinka Drzew/i);
  });

  it('should render NotFound for unknown route', async () => {
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
