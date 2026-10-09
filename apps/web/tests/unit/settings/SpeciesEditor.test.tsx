import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SpeciesEditor from '@/components/settings/SpeciesEditor';
import type { SpeciesConfig } from '@/db/schema';

const INITIAL: SpeciesConfig[] = [
  { name: 'Sosna', color: '#15803d' },
  { name: 'Brzoza', color: '#fef3c7' },
];

function setup(onSave: (species: SpeciesConfig[]) => Promise<void> = vi.fn((): Promise<void> => Promise.resolve())) {
  render(<SpeciesEditor initial={INITIAL} onSave={onSave} />);
  return onSave;
}

describe('SpeciesEditor', () => {
  it('should render initial species list', () => {
    setup();
    expect(screen.getByDisplayValue('Sosna')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Brzoza')).toBeInTheDocument();
  });

  it('should save after rename when valid', async () => {
    const onSave = setup();
    await userEvent.type(screen.getByLabelText('Nazwa gatunku 1'), ' zwyczajna');
    await userEvent.click(screen.getByTestId('species-save'));
    await waitFor(() => {
      expect(screen.getByTestId('species-saved')).toBeInTheDocument();
    });
    expect(onSave).toHaveBeenCalledWith([
      { name: 'Sosna zwyczajna', color: '#15803d' },
      { name: 'Brzoza', color: '#fef3c7' },
    ]);
  });

  it('should show error when species name is empty', async () => {
    setup();
    await userEvent.clear(screen.getByLabelText('Nazwa gatunku 1'));
    await userEvent.click(screen.getByTestId('species-save'));
    expect(screen.getByTestId('species-error')).toHaveTextContent('nazwę');
  });

  it('should show error when species names duplicate', async () => {
    setup();
    await userEvent.clear(screen.getByLabelText('Nazwa gatunku 1'));
    await userEvent.type(screen.getByLabelText('Nazwa gatunku 1'), 'Brzoza');
    await userEvent.click(screen.getByTestId('species-save'));
    expect(screen.getByTestId('species-error')).toHaveTextContent('Brzoza');
  });

  it('should add new species row', async () => {
    setup();
    await userEvent.click(screen.getByTestId('species-add'));
    expect(screen.getByLabelText('Nazwa gatunku 3')).toBeInTheDocument();
  });

  it('should remove species row', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Usuń gatunek Sosna' }));
    expect(screen.queryByDisplayValue('Sosna')).not.toBeInTheDocument();
  });

  it('should reorder species moved up', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Przenieś Brzoza w górę' }));
    expect(screen.getByLabelText('Nazwa gatunku 1')).toHaveValue('Brzoza');
  });

  it('should not move first species up', () => {
    setup();
    const up = screen.getByRole('button', { name: 'Przenieś Sosna w górę' });
    expect(up).toBeDisabled();
  });

  it('should restore default species list on reset', async () => {
    setup();
    await userEvent.click(screen.getByTestId('species-reset'));
    expect(screen.getByDisplayValue('Dąb')).toBeInTheDocument();
  });

  it('should show save failure as error', async () => {
    render(
      <SpeciesEditor initial={INITIAL} onSave={(): Promise<void> => Promise.reject(new Error('boom'))} />
    );
    await userEvent.click(screen.getByTestId('species-save'));
    expect(screen.getByTestId('species-error')).toHaveTextContent('boom');
  });
});
