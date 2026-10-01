import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('should render with given type', () => {
    render(<Input type="email" placeholder="Email" />);
    const input = screen.getByPlaceholderText<HTMLInputElement>('Email');
    expect(input.type).toBe('email');
  });

  it('should forward value and change events', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Input onChange={onChange} aria-label="name" />);
    const input = screen.getByLabelText('name');
    await user.type(input, 'hello');
    expect(onChange).toHaveBeenCalled();
    expect(input).toHaveValue('hello');
  });

  it('should expose invalid state via aria-invalid', () => {
    render(<Input invalid aria-label="invalid-input" />);
    const input = screen.getByLabelText('invalid-input');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('should forward ref', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="ref-input" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
