import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import GpsTroubleshootModal from '@/components/map/GpsTroubleshootModal';

describe('GpsTroubleshootModal', () => {
  it('should render nothing when open is false', () => {
    const { container } = render(
      <GpsTroubleshootModal open={false} onClose={vi.fn()} onRetry={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('should show the title, steps and help link when open', () => {
    render(<GpsTroubleshootModal open onClose={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByTestId('gps-troubleshoot-modal')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Brak sygnału GPS' })).toBeInTheDocument();
    expect(document.querySelectorAll('ol > li')).toHaveLength(4);
    const link = screen.getByTestId('gps-troubleshoot-link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('href')).toContain('https://');
  });

  it('should show the quick troubleshooting permission step in Polish', () => {
    render(<GpsTroubleshootModal open onClose={vi.fn()} onRetry={vi.fn()} />);
    expect(
      screen.getByText(/Zezwól tej stronie na dostęp do lokalizacji/),
    ).toBeInTheDocument();
  });

  it('should call onRetry when Spróbuj ponownie is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<GpsTroubleshootModal open onClose={vi.fn()} onRetry={onRetry} />);
    await user.click(screen.getByTestId('gps-troubleshoot-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when Zamknij is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<GpsTroubleshootModal open onClose={onClose} onRetry={vi.fn()} />);
    await user.click(screen.getByTestId('gps-troubleshoot-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should close on backdrop click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<GpsTroubleshootModal open onClose={onClose} onRetry={vi.fn()} />);
    await user.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
