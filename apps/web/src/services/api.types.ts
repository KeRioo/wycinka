export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthResponse {
  status: HealthStatus;
  version: string;
  uptime_seconds: number;
  db_loaded: boolean;
  pmtiles_loaded: boolean;
  data_freshness: string;
}

export interface VersionResponse {
  api: string;
  data: string;
  egib_source: string;
  etag: string;
}

export type LngLat = readonly [number, number];
export type BBox = readonly [number, number, number, number];

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: readonly (readonly LngLat[])[];
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: readonly (readonly (readonly LngLat[])[])[];
}

export type Geometry = PolygonGeometry | MultiPolygonGeometry;

export interface Parcel {
  id: string;
  teryt: string;
  number: string;
  voivodeship: string;
  county: string;
  commune: string;
  region: string;
  region_name: string;
  area_m2: number;
  land_use: string | null;
  voivodeship_code: string;
  county_code: string;
  commune_code: string;
  datasource: string;
  geom: Geometry;
  bbox: BBox;
  centroid: LngLat;
  fetched_at: string;
}

export interface NearbyParcel {
  id: string;
  distance_m: number;
}

export interface ParcelResponseFound {
  found: true;
  parcel: Parcel;
}

export interface ParcelResponseNotFound {
  found: false;
  nearby_parcels?: NearbyParcel[];
}

export type ParcelResponse = ParcelResponseFound | ParcelResponseNotFound;

export interface ParcelAggregateResponse {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: readonly unknown[];
  bbox: BBox;
  area_m2: number;
  parcels: string[];
}

export interface SearchResult {
  id: string;
  teryt: string;
  label: string;
  score?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'PARCEL_NOT_FOUND'
  | 'INVALID_TERYT'
  | 'DB_UNAVAILABLE'
  | 'PMTILES_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const TERYT_PATTERN = /^\d{6}_\d\.\d{4}\.[\d/]+$/;
