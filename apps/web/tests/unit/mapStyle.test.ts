import { describe, expect, it } from 'vitest';
import {
  buildStyleWithPMTiles,
  DZIALKI_FILL_MIN_ZOOM,
  DZIALKI_MIN_ZOOM,
} from '@/components/map/mapStyle';

const URL = 'http://localhost:8000/api/v1/pmtiles/dzialki';

function getLayer(id: string): Record<string, unknown> {
  const style = buildStyleWithPMTiles(URL);
  const found = style.layers.find((l) => l.id === id);
  if (!found) {
    throw new Error(`layer ${id} not found in style`);
  }
  return found;
}

describe('buildStyleWithPMTiles', () => {
  it('should set outline minzoom to DZIALKI_MIN_ZOOM on dzialki-outline layer', () => {
    expect(getLayer('dzialki-outline').minzoom).toBe(DZIALKI_MIN_ZOOM);
  });

  it('should set fill minzoom to DZIALKI_FILL_MIN_ZOOM on dzialki-fill layer', () => {
    expect(getLayer('dzialki-fill').minzoom).toBe(DZIALKI_FILL_MIN_ZOOM);
  });

  it('should not cap the highlight layers so active selection is always rendered', () => {
    expect(getLayer('highlight-fill').minzoom).toBeUndefined();
    expect(getLayer('highlight-outline').minzoom).toBeUndefined();
  });

  it('should not cap parcels layers because they come from project GeoJSON, not tiles', () => {
    expect(getLayer('parcels-fill').minzoom).toBeUndefined();
    expect(getLayer('parcels-outline').minzoom).toBeUndefined();
  });

  it('should use zoom-driven line width for the outline layer', () => {
    const width = getLayer('dzialki-outline').paint as Record<string, unknown>;
    const spec = width['line-width'] as (string | number | unknown[])[];
    expect(spec[0]).toBe('interpolate');
    expect(spec).toContain(DZIALKI_MIN_ZOOM);
  });

  it('should keep fill color switching threshold between 15 and 17 half the outline range', () => {
    expect(DZIALKI_FILL_MIN_ZOOM).toBeGreaterThan(DZIALKI_MIN_ZOOM);
  });
});
