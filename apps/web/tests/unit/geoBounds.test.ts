import { describe, expect, it } from 'vitest';
import type { Geometry } from '@/services/api.types';
import { geometryBounds, parcelFitBounds } from '@/lib/geo';

const polygon: Geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [21.0, 52.0],
      [21.02, 52.0],
      [21.02, 52.03],
      [21.0, 52.03],
      [21.0, 52.0],
    ],
  ],
};

describe('geometryBounds', () => {
  it('test_computes_min_max_from_polygon_when_valid_then_returns_bbox', () => {
    expect(geometryBounds(polygon)).toEqual([21.0, 52.0, 21.02, 52.03]);
  });

  it('test_aggregates_all_rings_when_multipolygon_then_returns_union_bbox', () => {
    const multi: Geometry = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [21.0, 52.0],
            [21.01, 52.0],
            [21.01, 52.01],
            [21.0, 52.01],
            [21.0, 52.0],
          ],
        ],
        [
          [
            [21.04, 52.05],
            [21.05, 52.05],
            [21.05, 52.06],
            [21.04, 52.06],
            [21.04, 52.05],
          ],
        ],
      ],
    };
    expect(geometryBounds(multi)).toEqual([21.0, 52.0, 21.05, 52.06]);
  });
});

describe('parcelFitBounds', () => {
  it('test_prefers_bbox_when_valid_then_returns_sw_ne_pair', () => {
    expect(parcelFitBounds([21.0, 52.0, 21.02, 52.03], polygon)).toEqual([
      [21.0, 52.0],
      [21.02, 52.03],
    ]);
  });

  it('test_falls_back_to_geometry_when_bbox_invalid_then_returns_sw_ne_pair', () => {
    const broken = [NaN, 52.0, 21.02, 52.03];
    expect(parcelFitBounds(broken, polygon)).toEqual([
      [21.0, 52.0],
      [21.02, 52.03],
    ]);
  });

  it('test_returns_null_when_bbox_invalid_and_geometry_empty_then_no_bounds', () => {
    const empty: Geometry = { type: 'Polygon', coordinates: [] };
    expect(parcelFitBounds(null, empty)).toBeNull();
  });
});
