const EARTH_RADIUS_M = 6_371_008.8;
const DEG_TO_RAD = Math.PI / 180;
const METERS_PER_DEG_LAT = 111_320;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MarkerScale {
  baseSize: number;
  perCm: number;
  maxSize: number;
}

export function offsetMeters(lat: number, lng: number, dxMeters: number, dyMeters: number): LatLng {
  const dLat = dyMeters / METERS_PER_DEG_LAT;
  const dLng = dxMeters / (METERS_PER_DEG_LAT * Math.cos(lat * DEG_TO_RAD));
  return { lat: lat + dLat, lng: lng + dLng };
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const dPhi = (lat2 - lat1) * DEG_TO_RAD;
  const dLambda = (lng2 - lng1) * DEG_TO_RAD;
  const a =
    Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export type AccuracyClass = 'good' | 'medium' | 'poor';

export function classifyAccuracy(meters: number): AccuracyClass {
  if (!Number.isFinite(meters) || meters < 0) {
    return 'poor';
  }
  if (meters < 10) {
    return 'good';
  }
  if (meters <= 30) {
    return 'medium';
  }
  return 'poor';
}

export function formatLatLng(lat: number, lng: number): string {
  const ns = lat >= 0 ? '° N' : '° S';
  const ew = lng >= 0 ? '° E' : '° W';
  return `${Math.abs(lat).toFixed(4)}${ns}, ${Math.abs(lng).toFixed(4)}${ew}`;
}

export function getSpeciesColor(species: string, fallback = '#6b7280'): string {
  return speciesColorMap.get(species) ?? fallback;
}

export function markerSizeForCm(circumference: number, scale: MarkerScale): number {
  const raw = scale.baseSize + scale.perCm * Math.max(0, circumference);
  return Math.min(scale.maxSize, Math.max(scale.baseSize, raw));
}

import { DEFAULT_SPECIES } from '@/db/schema';

const speciesColorMap = new Map<string, string>(
  DEFAULT_SPECIES.map((s) => [s.name, s.color]),
);
