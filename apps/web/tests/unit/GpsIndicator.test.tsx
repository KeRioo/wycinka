import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import GpsIndicator from '@/components/trees/GpsIndicator';

describe('GpsIndicator', () => {
  it('should render position with formatted coordinates and accuracy', () => {
    render(
      <GpsIndicator
        position={{ lat: 52.2297, lng: 21.0122, accuracy: 8 }}
        loading={false}
        error={null}
      />,
    );
    const coords = screen.getByTestId('gps-coords');
    expect(coords.textContent).toMatch(/52\.2297/);
    expect(coords.textContent).toMatch(/21\.0122/);
    expect(screen.getByText(/8 m/)).toBeInTheDocument();
    expect(screen.getByTestId('gps-accuracy-badge')).toHaveTextContent('dobra');
  });

  it('should show medium badge when accuracy is 10-30 m', () => {
    render(
      <GpsIndicator
        position={{ lat: 52, lng: 21, accuracy: 20 }}
        loading={false}
        error={null}
      />,
    );
    expect(screen.getByTestId('gps-accuracy-badge')).toHaveTextContent('średnia');
  });

  it('should show poor badge when accuracy > 30 m', () => {
    render(
      <GpsIndicator
        position={{ lat: 52, lng: 21, accuracy: 100 }}
        loading={false}
        error={null}
      />,
    );
    expect(screen.getByTestId('gps-accuracy-badge')).toHaveTextContent('słaba');
  });

  it('should show loading state when position is null', () => {
    render(<GpsIndicator position={null} loading error={null} />);
    expect(screen.getByTestId('gps-indicator-loading')).toBeInTheDocument();
    expect(screen.getByText(/GPS…/i)).toBeInTheDocument();
  });

  it('should show error state when error provided', () => {
    render(<GpsIndicator position={null} loading={false} error="Brak uprawnień" />);
    expect(screen.getByTestId('gps-indicator-error')).toBeInTheDocument();
    expect(screen.getByText(/Brak uprawnień/)).toBeInTheDocument();
  });

  it('should call onRefresh when refresh button clicked', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(
      <GpsIndicator
        position={{ lat: 52, lng: 21, accuracy: 8 }}
        loading={false}
        error={null}
        onRefresh={onRefresh}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Odśwież GPS/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('should not render refresh button when no onRefresh prop', () => {
    render(
      <GpsIndicator
        position={{ lat: 52, lng: 21, accuracy: 8 }}
        loading={false}
        error={null}
      />,
    );
    expect(screen.queryByRole('button', { name: /Odśwież GPS/i })).not.toBeInTheDocument();
  });
});
