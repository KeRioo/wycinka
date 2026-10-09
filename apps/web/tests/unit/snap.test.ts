import { describe, expect, it } from 'vitest';
import {
  extractVertexPoints,
  snapToVertex,
  snapThresholdMeters,
  SNAP_MAX_THRESHOLD_M,
  SNAP_THRESHOLD_M,
} from '@/lib/snap';
import type { Geometry } from '@/services/api.types';

const SQUARE: Geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [21.0122, 52.2297],
      [21.0125, 52.2297],
      [21.0125, 52.2300],
      [21.0122, 52.2300],
      [21.0122, 52.2297],
    ],
  ],
};

const MULTI_SQUARE: Geometry = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [21.0100, 52.2295],
        [21.0105, 52.2295],
        [21.0105, 52.2298],
        [21.0100, 52.2295],
      ],
    ],
    [
      [
        [21.0130, 52.2300],
        [21.0135, 52.2300],
        [21.0135, 52.2303],
        [21.0130, 52.2300],
      ],
    ],
  ],
};

describe('extractVertexPoints', () => {
  it('should return all ring vertices for a polygon', () => {
    expect(extractVertexPoints(SQUARE)).toHaveLength(5);
  });

  it('should return lat/lng in geographic order', () => {
    const vertices = extractVertexPoints(SQUARE);
    expect(vertices[0]).toEqual({ lat: 52.2297, lng: 21.0122 });
  });

  it('should flatten multipolygon rings', () => {
    expect(extractVertexPoints(MULTI_SQUARE)).toHaveLength(8);
  });
});

describe('snapToVertex', () => {
  it('should return null when there are no vertices', () => {
    expect(snapToVertex({ lat: 52.2297, lng: 21.0122 }, [], SNAP_THRESHOLD_M)).toBeNull();
  });

  it('should return null when no vertex is within the threshold', () => {
    const result = snapToVertex({ lat: 52.231, lng: 21.016 }, extractVertexPoints(SQUARE), SNAP_THRESHOLD_M);
    expect(result).toBeNull();
  });

  it('should snap to a vertex within the threshold', () => {
    const result = snapToVertex(
      { lat: 52.2297, lng: 21.0122005 },
      extractVertexPoints(SQUARE),
      SNAP_THRESHOLD_M,
    );
    expect(result?.point).toEqual({ lat: 52.2297, lng: 21.0122 });
  });

  it('should pick the nearest of two vertices within threshold', () => {
    const vertices = [
      { lat: 52.2297, lng: 21.0122 },
      { lat: 52.229709, lng: 21.0122 },
    ];
    const result = snapToVertex({ lat: 52.229704, lng: 21.0122 }, vertices, SNAP_THRESHOLD_M);
    expect(result?.point).toEqual({ lat: 52.2297, lng: 21.0122 });
  });

  it('should report the distance of the snapped vertex', () => {
    const result = snapToVertex(
      { lat: 52.2297, lng: 21.0122005 },
      extractVertexPoints(SQUARE),
      SNAP_THRESHOLD_M,
    );
    expect(result?.distanceM).toBeGreaterThan(0);
    expect(result?.distanceM).toBeLessThanOrEqual(SNAP_THRESHOLD_M);
  });

  it('should snap within an exact-threshold match for a known point pair', () => {
    const vertices = [{ lat: 52.2297, lng: 21.0123 }];
    const result = snapToVertex({ lat: 52.2297, lng: 21.0123 }, vertices, SNAP_MAX_THRESHOLD_M);
    expect(result?.point).toEqual(vertices[0]);
    expect(result?.distanceM).toBe(0);
  });
});

describe('snapThresholdMeters', () => {
  it('should floor the threshold at SNAP_THRESHOLD_M on very high zoom', () => {
    expect(snapThresholdMeters(22, 52.2297)).toBe(SNAP_THRESHOLD_M);
  });

  it('should cap the threshold at SNAP_MAX_THRESHOLD_M on low zoom', () => {
    expect(snapThresholdMeters(10, 52.2297)).toBe(SNAP_MAX_THRESHOLD_M);
  });

  it('should shrink the threshold as zoom increases', () => {
    const low = snapThresholdMeters(13, 52.2297);
    const high = snapThresholdMeters(17, 52.2297);
    expect(high).toBeLessThan(low);
  });

  it('should be smaller near the poles and larger at the equator', () => {
    expect(snapThresholdMeters(15, 80)).toBeLessThan(snapThresholdMeters(15, 0));
  });

  it('should fall back to the cap for invalid input', () => {
    expect(snapThresholdMeters(Number.NaN, 52)).toBe(SNAP_MAX_THRESHOLD_M);
  });
});
