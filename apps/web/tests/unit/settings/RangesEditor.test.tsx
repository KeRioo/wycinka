import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import RangesEditor from '@/components/settings/RangesEditor';
import type { RangeConfig } from '@/db/schema';

const INITIAL: RangeConfig[] = [
  { from: 0, to: 50, label: '< 50 cm' },
  { from: 50, to: 75, label: '50–75 cm' },
  { from: 75, to: Number.POSITIVE_INFINITY, label: 'ostatni' },
];

function setup(
  onSave: (ranges: RangeConfig[]) => Promise<void> = vi.fn((): Promise<void> => Promise.resolve()),
) {
  render(<RangesEditor initial={INITIAL} onSave={onSave} />);
  return onSave;
}

describe('RangesEditor', () => {
  it('should render initial ranges', () => {
    setup();
    expect(screen.getByLabelText('Etykieta przedziału 1')).toHaveValue('< 50 cm');
    expect(screen.getByLabelText('Przedział 1 od')).toHaveValue(0);
  });

  it('should mark last range as open-ended', () => {
    setup();
    expect(screen.getByTestId('ranges-open-2')).toHaveAttribute('aria-pressed', 'true');
  });

  it('should save valid ranges replacing defaults', async () => {
    const onSave = vi.fn((_ranges: RangeConfig[]): Promise<void> => Promise.resolve());
    render(<RangesEditor initial={INITIAL} onSave={onSave} />);
    const firstLabel = screen.getByLabelText('Etykieta przedziału 1');
    await userEvent.clear(firstLabel);
    await userEvent.type(firstLabel, 'małe pnie');
    await userEvent.click(screen.getByTestId('ranges-save'));
    await waitFor(() => {
      expect(screen.getByTestId('ranges-saved')).toBeInTheDocument();
    });
    const firstCall = onSave.mock.calls[0]?.[0];
    expect(firstCall?.[0]?.label).toBe('małe pnie');
  });

  it('should reject overlapping ranges', async () => {
    setup();
    await userEvent.clear(screen.getByLabelText('Przedział 2 od'));
    await userEvent.type(screen.getByLabelText('Przedział 2 od'), '40');
    await userEvent.click(screen.getByTestId('ranges-save'));
    expect(screen.getByTestId('ranges-error')).toHaveTextContent('rozłączne');
  });

  it('should reject when from >= to', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Przedział 1 od'), '60');
    await userEvent.click(screen.getByTestId('ranges-save'));
    expect(screen.getByTestId('ranges-error')).toHaveTextContent('od < do');
  });

  it('should reject empty label', async () => {
    setup();
    const label = screen.getByLabelText('Etykieta przedziału 1');
    await userEvent.clear(label);
    await userEvent.click(screen.getByTestId('ranges-save'));
    expect(screen.getByTestId('ranges-error')).toHaveTextContent('etykietę');
  });

  it('should add and remove ranges', async () => {
    setup();
    await userEvent.click(screen.getByTestId('ranges-add'));
    expect(screen.getByLabelText('Etykieta przedziału 4')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Usuń przedział 1' }));
    expect(screen.queryByLabelText('Etykieta przedziału 4')).not.toBeInTheDocument();
  });

  it('should toggle open-ended boundary', async () => {
    setup();
    const toggle = screen.getByTestId('ranges-open-0');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('should reorder ranges', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Przenieś przedział 2 w górę' }));
    expect(screen.getByLabelText('Etykieta przedziału 1')).toHaveValue('50–75 cm');
  });

  it('should restore default ranges on reset', async () => {
    setup();
    await userEvent.click(screen.getByTestId('ranges-reset'));
    expect(screen.getByLabelText('Etykieta przedziału 7')).toHaveValue('> 200 cm');
  });

  it('should show save failure as error', async () => {
    const onSave = vi.fn((): Promise<void> => {
      throw new Error('db down');
    });
    setup(onSave);
    await userEvent.click(screen.getByTestId('ranges-save'));
    await waitFor(() => {
      expect(screen.getByTestId('ranges-error')).toHaveTextContent('db down');
    });
  });
});
