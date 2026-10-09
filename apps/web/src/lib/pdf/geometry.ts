import type { Geometry } from '@/services/api.types';
import type { LngLat } from '@/services/api.types';

export type { LngLat } from '@/services/api.types';

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function polygonPoints(geometry: Geometry): LngLat[] {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates[0]?.map((p) => [...p] as [number, number]) ?? [];
  }
  return geometry.coordinates.flatMap((ring) => ring[0]?.map((p) => [...p] as [number, number]) ?? []);
}

export function bboxOf(points: readonly LngLat[]): BBox {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = points[0][0];
  let minY = points[0][1];
  let maxX = minX;
  let maxY = minY;
  for (const [lng, lat] of points) {
    minX = Math.min(minX, lng);
    minY = Math.min(minY, lat);
    maxX = Math.max(maxX, lng);
    maxY = Math.max(maxY, lat);
  }
  return { minX, minY, maxX, maxY };
}

function bboxArea(points: readonly LngLat[]): number {
  const bbox = bboxOf(points);
  return (bbox.maxX - bbox.minX) * (bbox.maxY - bbox.minY);
}

export function rotatePoints(
  points: readonly LngLat[],
  angleDeg: number,
  centerX: number,
  centerY: number,
): LngLat[] {
  if (angleDeg === 0) {
    return points.map((p) => [p[0], p[1]]);
  }
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return points.map(([lng, lat]) => {
    const dx = lng - centerX;
    const dy = lat - centerY;
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return [centerX + rx, centerY + ry] as LngLat;
  });
}

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LNG = 111.32;

export function midLatOf(points: readonly LngLat[]): number {
  const bbox = bboxOf(points);
  return (bbox.minY + bbox.maxY) / 2;
}

export function toKm(points: readonly LngLat[], lat0: number): LngLat[] {
  const factor = Math.cos((lat0 * Math.PI) / 180);
  return points.map(([lng, lat]) => [
    lng * KM_PER_DEG_LNG * factor,
    lat * KM_PER_DEG_LAT,
  ] as LngLat);
}

export function chooseRotation(
  points: readonly LngLat[],
  step = 5,
  maxDeg = 85,
): number {
  if (points.length < 2) {
    return 0;
  }
  const bbox = bboxOf(points);
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;

  let bestAngle = 0;
  let bestArea = bboxArea(points);
  for (let angle = step; angle <= maxDeg; angle += step) {
    const area = bboxArea(rotatePoints(points, angle, cx, cy));
    if (area < bestArea) {
      bestArea = area;
      bestAngle = angle;
    }
  }
  return bestAngle;
}

export type Projector = (lng: number, lat: number) => [number, number];

export function makeProjector(
  points: readonly LngLat[],
  rect: Rect,
  paddingMm = 6,
): Projector {
  const bbox = bboxOf(points);
  const spanX = Math.max(bbox.maxX - bbox.minX, 1e-6);
  const spanY = Math.max(bbox.maxY - bbox.minY, 1e-6);
  const usableW = rect.w - paddingMm * 2;
  const usableH = rect.h - paddingMm * 2;
  const scale = Math.min(usableW / spanX, usableH / spanY);

  const offsetX = rect.x + paddingMm + (usableW - spanX * scale) / 2;
  const offsetY = rect.y + paddingMm + (usableH - spanY * scale) / 2;

  return (lng: number, lat: number) =>
    [
      offsetX + (lng - bbox.minX) * scale,
      offsetY + (bbox.maxY - lat) * scale,
    ] as [number, number];
}
