import { getSpeciesColor, markerSizeForCm } from '@/lib/geo';
import {
  makeProjector,
  midLatOf,
  rotatePoints,
  toKm,
  bboxOf,
  chooseRotation,
  polygonPoints,
  type LngLat,
  type Rect,
} from './geometry';
import type { Parcel } from '@/services/api.types';
import type { PdfExportInput } from './pdfReport';

export const MAP_RECT_COMPACT: Rect = { x: 12, y: 30, w: 186, h: 150 };
export const MAP_RECT_FULL: Rect = { x: 12, y: 30, w: 186, h: 210 };

export interface MapLayoutMarker {
  x: number;
  y: number;
  r: number;
  color: string;
  label?: string;
}

export interface PdfMapLayout {
  rect: Rect;
  rotationDeg: number;
  rings: [number, number][][];
  markers: readonly MapLayoutMarker[];
}

type OuterRing = LngLat[];

function outerRingsOfGeometry(geometry: Parcel['geom']): OuterRing[] {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates
      .slice(0, 1)
      .map((ring) => ring.map(([lng, lat]) => [lng, lat] as LngLat));
  }
  return geometry.coordinates.map((polygon) =>
    polygon.slice(0, 1).flatMap((ring) => ring.map(([lng, lat]) => [lng, lat] as LngLat)),
  );
}

export function collectMapRings(input: PdfExportInput): readonly OuterRing[] {
  if (input.aggregate !== null && input.aggregate !== undefined) {
    if (input.aggregate.type === 'Polygon') {
      const ring = input.aggregate.coordinates[0] as LngLat[];
      return [ring.map(([lng, lat]) => [lng, lat] as LngLat)];
    }
    const polys = input.aggregate.coordinates as LngLat[][][];
    return polys.flatMap((polygon) =>
      polygon.slice(0, 1).map((ring) => ring.map(([lng, lat]) => [lng, lat] as LngLat)),
    );
  }
  if (input.parcels !== undefined && input.parcels.length > 0) {
    return input.parcels.flatMap((parcel) => outerRingsOfGeometry(parcel.geom));
  }
  const polygon = input.project.polygon;
  if (polygon === undefined) {
    return [];
  }
  const ring = polygonPoints(polygon);
  return ring.length > 0 ? [ring] : [];
}

export function computeMapLayout(input: PdfExportInput, compact: boolean): PdfMapLayout | null {
  const rect = compact ? MAP_RECT_COMPACT : MAP_RECT_FULL;
  const rings = collectMapRings(input);
  if (rings.length === 0) {
    return null;
  }
  const prefs = input.prefs ?? input.project.pdfPrefs;
  const lat0 = midLatOf(rings.flat());
  const kmRings = rings.map((ring) => toKm(ring, lat0));
  const kmPoints = kmRings.flat();
  const rotationDeg = prefs.autoRotate ? chooseRotation(kmPoints) : 0;
  const kmBbox = bboxOf(kmPoints);
  const cx = (kmBbox.minX + kmBbox.maxX) / 2;
  const cy = (kmBbox.minY + kmBbox.maxY) / 2;
  const rotatedRings = kmRings.map((ring) => rotatePoints(ring, rotationDeg, cx, cy));
  const project = makeProjector(rotatedRings.flat(), rect);

  const ringPoints = rotatedRings.map((ring) => ring.map((point) => project(point[0], point[1])));

  const markers = input.trees.map((tree, index) => {
    const kmPoint = toKm([[tree.lng, tree.lat]], lat0)[0];
    const rotated = rotatePoints([kmPoint], rotationDeg, cx, cy)[0];
    const [x, y] = project(rotated[0], rotated[1]);
    const radius = markerSizeForCm(tree.circumference, prefs.markerScale) / 2;
    return {
      x: clampInside(x, rect.x + radius + 1, rect.x + rect.w - radius - 1),
      y: clampInside(y, rect.y + radius + 1, rect.y + rect.h - radius - 1),
      r: radius,
      color: getSpeciesColor(tree.species),
      ...(prefs.showNumberedTable ? { label: String(index + 1) } : {}),
    };
  });

  return { rect, rotationDeg, rings: ringPoints, markers };
}

function clampInside(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
