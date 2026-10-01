import { describe, expect, it } from 'vitest';
import { cn, debounce, formatArea, formatCoordinate } from '@/lib/utils';

describe('cn', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should override conflicting tailwind classes', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('should filter falsy values', () => {
    expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar');
  });
});

describe('debounce', () => {
  it('should delay function execution', async () => {
    let called = 0;
    const fn = debounce(() => {
      called += 1;
    }, 50);
    fn();
    fn();
    fn();
    expect(called).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(called).toBe(1);
  });

  it('should pass arguments to debounced function', async () => {
    let received: readonly unknown[] = [];
    const fn = debounce((...args: readonly unknown[]) => {
      received = args;
    }, 10);
    fn(1, 2, 3);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(received).toEqual([1, 2, 3]);
  });
});

describe('formatArea', () => {
  it('should format small areas in m²', () => {
    expect(formatArea(123)).toBe('123 m²');
  });

  it('should format areas >= 1 ha in hectares', () => {
    expect(formatArea(12_345)).toBe('1.23 ha');
    expect(formatArea(100_000)).toBe('10.00 ha');
  });

  it('should format 0 correctly', () => {
    expect(formatArea(0)).toBe('0 m²');
  });
});

describe('formatCoordinate', () => {
  it('should format with 5 decimal places', () => {
    expect(formatCoordinate(52.231234, 21.012345)).toBe('52.23123, 21.01234');
  });
});
