import { describe, expect, it } from 'vitest';
import { compassNeedle } from '@/lib/pdf/compass';

describe('compassNeedle', () => {
  it('should point north above the center when rotation is zero', () => {
    const needle = compassNeedle(50, 50, 20, 0);
    expect(needle.northX).toBeCloseTo(50, 10);
    expect(needle.northY).toBeCloseTo(30, 10);
    expect(needle.southY).toBeCloseTo(70, 10);
  });

  it('should point east when rotated 90 degrees', () => {
    const needle = compassNeedle(50, 50, 20, 90);
    expect(needle.northX).toBeCloseTo(30, 10);
    expect(needle.northY).toBeCloseTo(50, 10);
  });

  it('should point north-west when rotated 45 degrees', () => {
    const needle = compassNeedle(50, 50, 20, 45);
    expect(needle.northX).toBeLessThan(50);
    expect(needle.northY).toBeLessThan(50);
  });

  it('should place the N label outside the needle tip', () => {
    const needle = compassNeedle(50, 50, 20, 0);
    expect(needle.labelX).toBeCloseTo(50, 10);
    expect(needle.labelY).toBeCloseTo(26, 10);
  });
});
