import { describe, expect, it } from 'vitest';
import {
  classifyAccuracy,
  formatLatLng,
  getSpeciesColor,
  haversineMeters,
  markerSizeForCm,
  offsetMeters,
} from '@/lib/geo';

describe('offsetMeters', () => {
  it('should return same point when offsets are zero', () => {
    const p = offsetMeters(52.0, 21.0, 0, 0);
    expect(p.lat).toBeCloseTo(52.0, 10);
    expect(p.lng).toBeCloseTo(21.0, 10);
  });

  it('should move north when dy positive', () => {
    const p = offsetMeters(52.0, 21.0, 0, 100);
    expect(p.lat).toBeGreaterThan(52.0);
    expect(p.lng).toBeCloseTo(21.0, 6);
  });

  it('should move east when dx positive', () => {
    const p = offsetMeters(52.0, 21.0, 100, 0);
    expect(p.lat).toBeCloseTo(52.0, 6);
    expect(p.lng).toBeGreaterThan(21.0);
  });

  it('should roundtrip via offsetMeters and haversine', () => {
    const lat = 52.2297;
    const lng = 21.0122;
    const dx = 12.5;
    const dy = -7.25;
    const moved = offsetMeters(lat, lng, dx, dy);
    const back = offsetMeters(moved.lat, moved.lng, -dx, -dy);
    expect(back.lat).toBeCloseTo(lat, 6);
    expect(back.lng).toBeCloseTo(lng, 6);
    expect(haversineMeters(lat, lng, moved.lat, moved.lng)).toBeGreaterThan(0);
  });
});

describe('haversineMeters', () => {
  it('should be zero for identical points', () => {
    expect(haversineMeters(52.0, 21.0, 52.0, 21.0)).toBe(0);
  });

  it('should match ~111 km per degree of latitude', () => {
    const d = haversineMeters(52.0, 21.0, 53.0, 21.0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('should be symmetric', () => {
    const a = haversineMeters(52.0, 21.0, 52.001, 21.001);
    const b = haversineMeters(52.001, 21.001, 52.0, 21.0);
    expect(a).toBeCloseTo(b, 6);
  });

  it('should compute ~157 km between Warsaw and Łódź (approx)', () => {
    const warsaw = { lat: 52.2297, lng: 21.0122 };
    const lodz = { lat: 51.7592, lng: 19.456 };
    const d = haversineMeters(warsaw.lat, warsaw.lng, lodz.lat, lodz.lng);
    expect(d).toBeGreaterThan(115_000);
    expect(d).toBeLessThan(135_000);
  });
});

describe('classifyAccuracy', () => {
  it('should return good below 10 m', () => {
    expect(classifyAccuracy(0)).toBe('good');
    expect(classifyAccuracy(5)).toBe('good');
    expect(classifyAccuracy(9.99)).toBe('good');
  });

  it('should return medium between 10 and 30 m inclusive', () => {
    expect(classifyAccuracy(10)).toBe('medium');
    expect(classifyAccuracy(20)).toBe('medium');
    expect(classifyAccuracy(30)).toBe('medium');
  });

  it('should return poor above 30 m', () => {
    expect(classifyAccuracy(31)).toBe('poor');
    expect(classifyAccuracy(100)).toBe('poor');
  });

  it('should return poor for invalid input', () => {
    expect(classifyAccuracy(Number.NaN)).toBe('poor');
    expect(classifyAccuracy(-1)).toBe('poor');
    expect(classifyAccuracy(Number.POSITIVE_INFINITY)).toBe('poor');
  });
});

describe('formatLatLng', () => {
  it('should format northern/eastern coords with N/E', () => {
    expect(formatLatLng(52.2297, 21.0122)).toBe('52.2297° N, 21.0122° E');
  });

  it('should format southern/western coords with S/W and absolute values', () => {
    expect(formatLatLng(-33.8688, -151.2093)).toBe('33.8688° S, 151.2093° W');
  });

  it('should handle zero crossings', () => {
    expect(formatLatLng(0, 0)).toBe('0.0000° N, 0.0000° E');
  });
});

describe('getSpeciesColor', () => {
  it('should return known color for known species', () => {
    expect(getSpeciesColor('Dąb')).toBe('#92400e');
    expect(getSpeciesColor('Sosna')).toBe('#15803d');
    expect(getSpeciesColor('Inne')).toBe('#6b7280');
  });

  it('should return fallback for unknown species', () => {
    expect(getSpeciesColor('Not-A-Species')).toBe('#6b7280');
    expect(getSpeciesColor('Not-A-Species', '#000000')).toBe('#000000');
  });

  it('should be case-sensitive', () => {
    expect(getSpeciesColor('dąb')).toBe('#6b7280');
  });
});

describe('markerSizeForCm', () => {
  const scale = { baseSize: 6, perCm: 0.1, maxSize: 18 };

  it('should return base size for zero circumference', () => {
    expect(markerSizeForCm(0, scale)).toBe(6);
  });

  it('should grow with circumference', () => {
    expect(markerSizeForCm(50, scale)).toBe(11);
  });

  it('should clamp to maxSize', () => {
    expect(markerSizeForCm(500, scale)).toBe(18);
  });

  it('should clamp negative to baseSize', () => {
    expect(markerSizeForCm(-100, scale)).toBe(6);
  });
});
