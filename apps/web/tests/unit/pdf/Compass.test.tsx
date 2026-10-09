import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Compass from '@/components/pdf/Compass';

describe('Compass', () => {
  it('should render an accessible compass image', () => {
    render(<Compass size={64} rotationDeg={0} />);
    const svg = screen.getByRole('img', { name: 'Kompas — północ prawdziwa' });
    expect(svg).toBeInTheDocument();
  });

  it('should expose the rotation as a data attribute for variants', () => {
    render(<Compass size={64} rotationDeg={90} />);
    expect(screen.getByTestId('compass-svg').getAttribute('data-rotation')).toBe('90');
  });

  it('should draw the north label', () => {
    render(<Compass size={64} rotationDeg={0} />);
    expect(screen.getByText('N')).toBeInTheDocument();
  });
});
