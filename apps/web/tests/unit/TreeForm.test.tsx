import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '@/db/schema';
import { useTreeStore } from '@/stores/treeStore';
import TreeForm from '@/components/trees/TreeForm';

describe('TreeForm', () => {
  beforeEach(async () => {
    db.delete();
    await db.open();
    useTreeStore.getState().clear();
  });

  afterEach(() => {
    if (db.isOpen()) {
      db.close();
    }
  });

  it('should render species, circumference, notes fields', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(<TreeForm />);
    expect(screen.getByTestId('tree-species')).toBeInTheDocument();
    expect(screen.getByTestId('tree-circumference')).toBeInTheDocument();
    expect(screen.getByTestId('tree-notes')).toBeInTheDocument();
  });

  it('should show species error when submitted empty', async () => {
    const user = userEvent.setup();
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(<TreeForm />);
    const circumference = screen.getByTestId('tree-circumference');
    await user.type(circumference, '50');
    await user.tab();
    expect(screen.getByTestId('tree-species-error')).toHaveTextContent(/Wybierz gatunek/i);
  });

  it('should show circumference error when value is 0', async () => {
    const user = userEvent.setup();
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(<TreeForm />);
    await user.selectOptions(screen.getByTestId('tree-species'), 'Dąb');
    const circumference = screen.getByTestId('tree-circumference');
    await user.clear(circumference);
    await user.type(circumference, '0');
    await user.tab();
    expect(screen.getByTestId('tree-circumference-error')).toBeInTheDocument();
  });

  it('should sync species changes to treeStore', async () => {
    const user = userEvent.setup();
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(<TreeForm />);
    await user.selectOptions(screen.getByTestId('tree-species'), 'Sosna');
    expect(useTreeStore.getState().pending?.species).toBe('Sosna');
  });

  it('should sync circumference changes to treeStore', async () => {
    const user = userEvent.setup();
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(<TreeForm />);
    const circumference = screen.getByTestId('tree-circumference');
    await user.type(circumference, '85');
    expect(useTreeStore.getState().pending?.circumference).toBe(85);
  });

  it('should sync notes changes to treeStore', async () => {
    const user = userEvent.setup();
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(<TreeForm />);
    const notes = screen.getByTestId('tree-notes');
    await user.type(notes, 'Duży dąb');
    expect(useTreeStore.getState().pending?.notes).toBe('Duży dąb');
  });

  it('should prefill from pending state', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    useTreeStore.getState().setSpecies('Dąb');
    useTreeStore.getState().setCircumference(85);
    render(<TreeForm />);
    expect(screen.getByTestId<HTMLInputElement>('tree-circumference').value).toBe('85');
    expect(screen.getByTestId<HTMLSelectElement>('tree-species').value).toBe('Dąb');
  });

  it('should apply defaultSpecies when provided', () => {
    useTreeStore.getState().startPlacing({ gpsPosition: { lat: 52, lng: 21 } });
    render(<TreeForm defaultSpecies="Buk" />);
    expect(screen.getByTestId<HTMLSelectElement>('tree-species').value).toBe('Buk');
  });
});
