import { haversineMeters, type LatLng } from './geo';
import type { Geometry } from '@/services/api.types';

export const SNAP_THRESHOLD_M = 1;
export const SNAP_RADIUS_PX = 12;
export const SNAP_MAX_THRESHOLD_M = 20;
const WEB_MERCATOR_WORLD_METERS = 40_075_016.686;
const WEB_MERCATOR_TILE_PX = 512;

export interface SnapResult {
  point: LatLng;
  distanceM: number;
}

export function extractVertexPoints(geom: Geometry): LatLng[] {
  const vertices: LatLng[] = [];
  const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat();
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      vertices.push({ lat, lng });
    }
  }
  return vertices;
}

export function snapToVertex(
  point: LatLng,
  vertices: readonly LatLng[],
  thresholdM: number = SNAP_THRESHOLD_M,
): SnapResult | null {
  let best: SnapResult | null = null;
  for (const vertex of vertices) {
    const distanceM = haversineMeters(point.lat, point.lng, vertex.lat, vertex.lng);
    if (distanceM > thresholdM) {
      continue;
    }
    if (best === null || distanceM < best.distanceM) {
      best = { point: { lat: vertex.lat, lng: vertex.lng }, distanceM };
    }
  }
  return best;
}

export function snapThresholdMeters(zoom: number, lat: number): number {
  if (!Number.isFinite(zoom) || !Number.isFinite(lat)) {
    return SNAP_MAX_THRESHOLD_M;
  }
  const metersPerPx =
    (WEB_MERCATOR_WORLD_METERS * Math.cos((lat * Math.PI) / 180)) /
    (WEB_MERCATOR_TILE_PX * 2 ** zoom);
  const byPixels = metersPerPx * SNAP_RADIUS_PX;
  return Math.min(SNAP_MAX_THRESHOLD_M, Math.max(SNAP_THRESHOLD_M, byPixels));
}
