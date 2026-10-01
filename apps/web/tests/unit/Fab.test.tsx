import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Fab from '@/components/trees/Fab';

describe('Fab', () => {
  it('should render with default label', () => {
    render(<Fab onClick={vi.fn()} />);
    expect(screen.getByTestId('fab-add-tree')).toHaveAttribute('aria-label', 'Dodaj drzewo');
  });

  it('should render with custom label', () => {
    render(<Fab onClick={vi.fn()} label="Dodaj notatkę" />);
    expect(screen.getByTestId('fab-add-tree')).toHaveAttribute('aria-label', 'Dodaj notatkę');
  });

  it('should call onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Fab onClick={onClick} />);
    await user.click(screen.getByTestId('fab-add-tree'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should apply custom className', () => {
    render(<Fab onClick={vi.fn()} className="custom-class" />);
    const fab = screen.getByTestId('fab-add-tree');
    expect(fab.className).toContain('custom-class');
    expect(fab.className).toContain('rounded-full');
  });
});
