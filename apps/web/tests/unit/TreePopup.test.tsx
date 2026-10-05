import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Tree } from '@/db/schema';
import TreePopup from '@/components/trees/TreePopup';

function makeTree(overrides: Partial<Tree> = {}): Tree {
  return {
    id: 't1',
    projectId: 'p1',
    lat: 52.2297,
    lng: 21.0122,
    capturedAt: new Date(2026, 9, 4),
    species: 'Dąb',
    circumference: 85,
    ...overrides,
  };
}

describe('TreePopup', () => {
  it('should render species, circumference, date and coordinates', () => {
    render(
      <TreePopup
        tree={makeTree()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const popup = screen.getByTestId('tree-popup');
    expect(popup).toHaveTextContent('Dąb');
    expect(popup).toHaveTextContent('Obwód: 85 cm');
    expect(popup).toHaveTextContent('Data: 04.10.2026');
    expect(popup).toHaveTextContent(/Położenie:/);
    expect(popup).toHaveTextContent(/52\.2297/);
  });

  it('should render notes when present', () => {
    render(
      <TreePopup
        tree={makeTree({ notes: 'Druga gałąź po lewej' })}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByTestId('tree-popup')).toHaveTextContent(
      'Notatka: Druga gałąź po lewej',
    );
  });

  it('should not render notes when absent', () => {
    render(<TreePopup tree={makeTree()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByTestId('tree-popup')).not.toHaveTextContent(/Notatka:/);
  });

  it('should call onEdit when the edit button is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<TreePopup tree={makeTree()} onEdit={onEdit} onDelete={vi.fn()} />);
    await user.click(screen.getByTestId('tree-popup-edit'));
    expect(onEdit).toHaveBeenCalled();
  });

  it('should call onDelete when the delete button is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<TreePopup tree={makeTree()} onEdit={vi.fn()} onDelete={onDelete} />);
    await user.click(screen.getByTestId('tree-popup-delete'));
    expect(onDelete).toHaveBeenCalled();
  });

  it('should call onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TreePopup tree={makeTree()} onEdit={vi.fn()} onDelete={vi.fn()} onClose={onClose} />);
    await user.click(screen.getByTestId('tree-popup-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('should not render close button when onClose is not provided', () => {
    render(<TreePopup tree={makeTree()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByTestId('tree-popup-close')).not.toBeInTheDocument();
  });
});
