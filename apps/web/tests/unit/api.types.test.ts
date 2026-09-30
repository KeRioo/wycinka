import { describe, expect, it } from 'vitest';
import { ApiError, TERYT_PATTERN } from '@/services/api.types';

describe('TERYT_PATTERN', () => {
  it('should accept valid Warsaw TERYT', () => {
    expect(TERYT_PATTERN.test('141201_1.0001.6509')).toBe(true);
  });

  it('should accept divided parcel', () => {
    expect(TERYT_PATTERN.test('226101_1.0001.12/3')).toBe(true);
  });

  it('should reject malformed TERYT', () => {
    expect(TERYT_PATTERN.test('1234')).toBe(false);
    expect(TERYT_PATTERN.test('not-a-teryt')).toBe(false);
  });
});

describe('ApiError', () => {
  it('should construct with all properties', () => {
    const error = new ApiError('BAD_REQUEST', 'Invalid input', 400, { field: 'lat' });
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.message).toBe('Invalid input');
    expect(error.status).toBe(400);
    expect(error.details).toEqual({ field: 'lat' });
    expect(error.name).toBe('ApiError');
    expect(error).toBeInstanceOf(Error);
  });

  it('should construct without details', () => {
    const error = new ApiError('UNKNOWN', 'Something', 500);
    expect(error.details).toBeUndefined();
  });
});
