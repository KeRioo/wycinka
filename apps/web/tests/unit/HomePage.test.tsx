import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HomePage from '@/pages/HomePage';

vi.mock('lucide-react', () => ({
  TreePine: () => <svg data-testid="tree-icon" />,
  MapPin: () => <svg data-testid="mappin-icon" />,
  Camera: () => <svg data-testid="camera-icon" />,
  FileText: () => <svg data-testid="file-icon" />,
}));

describe('HomePage', () => {
  it('should render hero section', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Wycinka Drzew/i);
    expect(screen.getByRole('link', { name: /Otwórz mapę/i })).toBeInTheDocument();
  });

  it('should render feature cards', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Działki z EGiB/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Inwentaryzacja drzew/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Raport PDF/i })).toBeInTheDocument();
  });

  it('should navigate to /map when CTA is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <HomePage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('link', { name: /Otwórz mapę/i }));
    expect(screen.getByRole('link', { name: /Otwórz mapę/i })).toHaveAttribute('href', '/map');
  });
});
