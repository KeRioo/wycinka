import { describe, expect, it } from 'vitest';
import type { PolygonGeometry } from '@/services/api.types';
import {
  bboxOf,
  chooseRotation,
  makeProjector,
  polygonPoints,
  rotatePoints,
} from '@/lib/pdf/geometry';

const SQUARE: PolygonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [21.0, 52.2],
      [21.02, 52.2],
      [21.02, 52.22],
      [21.0, 52.22],
      [21.0, 52.2],
    ],
  ],
};

describe('polygonPoints', () => {
  it('should flatten the outer ring of a polygon', () => {
    const points = polygonPoints(SQUARE);
    expect(points).toHaveLength(5);
    expect(points[0]).toEqual([21.0, 52.2]);
  });

  it('should return an empty list when coordinates are missing', () => {
    expect(polygonPoints({ type: 'Polygon', coordinates: [] })).toEqual([]);
  });
});

describe('bboxOf', () => {
  it('should compute min and max extents', () => {
    const bbox = bboxOf([
      [21.0, 52.2],
      [21.02, 52.24],
    ]);
    expect(bbox).toEqual({ minX: 21.0, minY: 52.2, maxX: 21.02, maxY: 52.24 });
  });

  it('should return a zero bbox for an empty list', () => {
    expect(bboxOf([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });
});

describe('rotatePoints', () => {
  it('should keep points unchanged for zero angle', () => {
    const rotated = rotatePoints([[1, 2]], 0, 0, 0);
    expect(rotated[0]).toEqual([1, 2]);
  });

  it('should rotate a point by 90 degrees around origin', () => {
    const rotated = rotatePoints([[1, 0]], 90, 0, 0);
    expect(rotated[0][0]).toBeCloseTo(0, 10);
    expect(rotated[0][1]).toBeCloseTo(1, 10);
  });

  it('should rotate around a provided center', () => {
    const rotated = rotatePoints([[2, 1]], 90, 1, 1);
    expect(rotated[0][0]).toBeCloseTo(1, 10);
    expect(rotated[0][1]).toBeCloseTo(2, 10);
  });
});

describe('chooseRotation', () => {
  it('should return zero when rotation does not help an axis-aligned square', () => {
    const points = polygonPoints(SQUARE);
    expect(chooseRotation(points)).toBe(0);
  });

  it('should pick the angle that minimises the bounding box area', () => {
    const diamond = polygonPoints({
      type: 'Polygon',
      coordinates: [
        [
          [0, 1],
          [1, 2],
          [2, 1],
          [1, 0],
          [0, 1],
        ],
      ],
    });
    expect(chooseRotation(diamond, 15)).toBe(45);
  });

  it('should return zero for degenerate input', () => {
    expect(chooseRotation([[1, 1]])).toBe(0);
  });
});

describe('makeProjector', () => {
  const points: [number, number][] = [
    [0, 0],
    [10, 10],
  ];
  const rect = { x: 10, y: 20, w: 30, h: 40 };
  it('should map the bounding box corners into the target rect', () => {
    const project = makeProjector(points, rect, 5);
    const topLeft = project(0, 10);
    const bottomRight = project(10, 0);
    expect(topLeft[0]).toBeCloseTo(15, 6);
    expect(topLeft[1]).toBeCloseTo(30, 6);
    expect(bottomRight[0]).toBeCloseTo(35, 6);
    expect(bottomRight[1]).toBeCloseTo(50, 6);
  });

  it('should flip the y axis so north is up', () => {
    const project = makeProjector(points, rect, 5);
    const north = project(5, 10);
    const mid = project(5, 5);
    expect(north[1]).toBeLessThan(mid[1]);
  });});
