import type { ParcelResponse, SearchResponse, VersionResponse } from '@/services/api.types';

export const MOCK_VERSION: VersionResponse = {
  api: '1.0.0',
  data: '2026-09-29',
  egib_source: 'geoportal.gov.pl',
  etag: 'abc123def456',
};

export const MOCK_PARCEL_FOUND: ParcelResponse = {
  found: true,
  parcel: {
    id: '141201_1.0001.6509',
    teryt: '141201_1.0001.6509',
    number: '6509',
    voivodeship: 'mazowieckie',
    county: 'Warszawa',
    commune: 'Śródmieście',
    region: '0001',
    region_name: 'Obręb 0001',
    area_m2: 1234.56,
    land_use: 'Ls',
    geom: {
      type: 'Polygon',
      coordinates: [
        [
          [21.006, 52.231],
          [21.007, 52.231],
          [21.007, 52.232],
          [21.006, 52.232],
          [21.006, 52.231],
        ],
      ],
    },
    bbox: [21.006, 52.231, 21.007, 52.232],
    centroid: [21.0065, 52.2315],
    fetched_at: '2026-09-29T03:00:00Z',
  },
};

export const MOCK_PARCEL_NOT_FOUND: ParcelResponse = {
  found: false,
  nearby_parcels: [{ id: '141201_1.0001.6509', distance_m: 12.3 }],
};

export const MOCK_SEARCH_RESPONSE: SearchResponse = {
  results: [
    {
      id: '141201_1.0001.6509',
      teryt: '141201_1.0001.6509',
      label: '141201_1.0001.6509 — Obręb 0001, Warszawa',
      score: 0.95,
    },
  ],
  total: 1,
};
