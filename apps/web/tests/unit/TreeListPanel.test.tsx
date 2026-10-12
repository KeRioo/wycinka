import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tree } from '@/db/schema';
import TreeListPanel from '@/components/trees/TreeListPanel';

type MediaListener = () => void;

const mediaQueryState = vi.hoisted(() => ({
  matches: false,
  listeners: [] as MediaListener[],
}));

function installMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: MediaListener) => {
      mediaQueryState.listeners.push(listener);
    }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
  }));
}

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

function makeHandlers() {
  return {
    onClose: vi.fn(),
    onSelectTree: vi.fn(),
    onDeleteTree: vi.fn(),
    onEditTree: vi.fn(),
  };
}

describe('TreeListPanel', () => {
  it('should render nothing when closed', () => {
    const handlers = makeHandlers();
    render(
      <TreeListPanel
        open={false}
        onClose={handlers.onClose}
        trees={[makeTree()]}
        onSelectTree={handlers.onSelectTree}
        onDeleteTree={handlers.onDeleteTree}
        onEditTree={handlers.onEditTree}
      />,
    );
    expect(screen.queryByTestId('tree-list-panel')).not.toBeInTheDocument();
  });

  it('should render list rows with species, circumference and date when open', () => {
    const handlers = makeHandlers();
    render(
      <TreeListPanel
        open
        onClose={handlers.onClose}
        trees={[makeTree()]}
        onSelectTree={handlers.onSelectTree}
        onDeleteTree={handlers.onDeleteTree}
        onEditTree={handlers.onEditTree}
      />,
    );
    expect(screen.getByTestId('tree-list-panel')).toBeInTheDocument();
    const item = screen.getByTestId('tree-list-item');
    expect(item).toHaveTextContent('Dąb');
    expect(item).toHaveTextContent('Obwód: 85 cm');
    expect(item).toHaveTextContent('04.10.2026');
    expect(screen.getByText('Drzewa')).toBeInTheDocument();
  });

  it('should show empty state when there are no trees', () => {
    const handlers = makeHandlers();
    render(
      <TreeListPanel
        open
        onClose={handlers.onClose}
        trees={[]}
        onSelectTree={handlers.onSelectTree}
        onDeleteTree={handlers.onDeleteTree}
        onEditTree={handlers.onEditTree}
      />,
    );
    expect(screen.getByTestId('tree-list-empty')).toHaveTextContent('Brak drzew w tym projekcie.');
    expect(screen.queryByTestId('tree-list-item')).not.toBeInTheDocument();
  });

  it('should call onSelectTree when a row is clicked', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    render(
      <TreeListPanel
        open
        onClose={handlers.onClose}
        trees={[makeTree(), makeTree({ id: 't2', species: 'Sosna', circumference: 60 })]}
        onSelectTree={handlers.onSelectTree}
        onDeleteTree={handlers.onDeleteTree}
        onEditTree={handlers.onEditTree}
      />,
    );
    const rows = screen.getAllByTestId('tree-list-item');
    const secondRowSelectButton = rows[1]?.querySelector('button');
    if (secondRowSelectButton === null) {
      throw new Error('row select button missing');
    }
    await user.click(secondRowSelectButton);
    expect(handlers.onSelectTree).toHaveBeenCalledWith('t2');
  });

  it('should call onEditTree when the edit button is clicked', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    render(
      <TreeListPanel
        open
        onClose={handlers.onClose}
        trees={[makeTree()]}
        onSelectTree={handlers.onSelectTree}
        onDeleteTree={handlers.onDeleteTree}
        onEditTree={handlers.onEditTree}
      />,
    );
    await user.click(screen.getByTestId('tree-list-edit-t1'));
    expect(handlers.onEditTree).toHaveBeenCalledWith('t1');
    expect(handlers.onSelectTree).not.toHaveBeenCalled();
  });

  it('should call onDeleteTree when the delete button is clicked', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    render(
      <TreeListPanel
        open
        onClose={handlers.onClose}
        trees={[makeTree()]}
        onSelectTree={handlers.onSelectTree}
        onDeleteTree={handlers.onDeleteTree}
        onEditTree={handlers.onEditTree}
      />,
    );
    await user.click(screen.getByTestId('tree-list-delete-t1'));
    expect(handlers.onDeleteTree).toHaveBeenCalledWith('t1');
    expect(handlers.onSelectTree).not.toHaveBeenCalled();
  });

  it('should call onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const handlers = makeHandlers();
    render(
      <TreeListPanel
        open
        onClose={handlers.onClose}
        trees={[makeTree()]}
        onSelectTree={handlers.onSelectTree}
        onDeleteTree={handlers.onDeleteTree}
        onEditTree={handlers.onEditTree}
      />,
    );
    await user.click(screen.getByTestId('tree-list-close'));
    expect(handlers.onClose).toHaveBeenCalled();
  });
});

describe('TreeListPanel — split panel container (B4)', () => {
  beforeEach(() => {
    mediaQueryState.matches = false;
    mediaQueryState.listeners = [];
  });

  it('should render inside the bottom-half split shell on mobile', () => {
    installMatchMedia(true);
    render(
      <TreeListPanel
        open
        onClose={vi.fn()}
        trees={[makeTree()]}
        onSelectTree={vi.fn()}
        onDeleteTree={vi.fn()}
        onEditTree={vi.fn()}
      />,
    );
    const panel = screen.getByTestId('tree-list-panel');
    expect(panel).toHaveAttribute('data-split-panel', 'true');
    expect(panel.className).toContain('h-[50dvh]');
    expect(panel.className).toContain('min-h-[300px]');
    expect(panel.className).toContain('rounded-t-2xl');
  });

  it('should keep the right drawer layout on desktop', () => {
    installMatchMedia(false);
    render(
      <TreeListPanel
        open
        onClose={vi.fn()}
        trees={[makeTree()]}
        onSelectTree={vi.fn()}
        onDeleteTree={vi.fn()}
        onEditTree={vi.fn()}
      />,
    );
    const panel = screen.getByTestId('tree-list-panel');
    expect(panel).toHaveAttribute('data-split-panel', 'false');
    expect(panel.className).toContain('border-l');
    expect(panel.className).toContain('w-80');
    expect(panel.className).not.toContain('h-[50dvh]');
  });
});
