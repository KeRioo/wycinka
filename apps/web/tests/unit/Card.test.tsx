import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

describe('Card primitives', () => {
  it('should render children in Card', () => {
    render(<Card>Body content</Card>);
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('should render CardHeader with title', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>My title</CardTitle>
        </CardHeader>
        <CardContent>Body</CardContent>
      </Card>,
    );
    expect(screen.getByText('My title')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('should render CardTitle as h2', () => {
    render(<CardTitle>Header</CardTitle>);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Header');
  });
});
