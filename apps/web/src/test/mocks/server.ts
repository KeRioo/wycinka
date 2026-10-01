import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MOCK_PARCEL_FOUND, MOCK_PARCEL_NOT_FOUND, MOCK_SEARCH_RESPONSE, MOCK_VERSION } from './api-responses';

export const handlers = [
  http.get('*/health', () =>
    HttpResponse.json({
      status: 'ok',
      version: '1.0.0',
      uptime_seconds: 3600,
      db_loaded: true,
      pmtiles_loaded: true,
      data_freshness: '2026-09-29T03:00:00Z',
    }),
  ),
  http.get('*/api/v1/version', () => HttpResponse.json(MOCK_VERSION)),
  http.get('*/api/v1/parcel/aggregate', ({ request }) => {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (id === null || id.length === 0) {
      return HttpResponse.json(
        { error: 'id required', code: 'BAD_REQUEST', details: {} },
        { status: 400 },
      );
    }
    return HttpResponse.json({
      type: 'Polygon',
      coordinates: [],
      bbox: [21.006, 52.231, 21.007, 52.232],
      area_m2: 1234.56,
      parcels: id.split(','),
    });
  }),
  http.get('*/api/v1/parcel/:teryt', ({ params }) => {
    const teryt = String(params.teryt);
    if (teryt === '141201_1.0001.6509') {
      return HttpResponse.json(MOCK_PARCEL_FOUND);
    }
    return HttpResponse.json(
      { error: 'Parcel not found', code: 'PARCEL_NOT_FOUND', details: { teryt } },
      { status: 404 },
    );
  }),
  http.get('*/api/v1/parcel', ({ request }) => {
    const url = new URL(request.url);
    const lat = url.searchParams.get('lat');
    const lng = url.searchParams.get('lng');
    if (lat === null || lng === null) {
      return HttpResponse.json(
        { error: 'lat/lng required', code: 'BAD_REQUEST', details: {} },
        { status: 400 },
      );
    }
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return HttpResponse.json(
        { error: 'Invalid coordinates', code: 'BAD_REQUEST', details: {} },
        { status: 400 },
      );
    }
    if (Math.abs(latNum - 52.23) < 0.01 && Math.abs(lngNum - 21.01) < 0.01) {
      return HttpResponse.json(MOCK_PARCEL_FOUND);
    }
    return HttpResponse.json(MOCK_PARCEL_NOT_FOUND);
  }),
  http.get('*/api/v1/search', ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q');
    if (q === null || q.length === 0) {
      return HttpResponse.json(
        { error: 'q required', code: 'BAD_REQUEST', details: {} },
        { status: 400 },
      );
    }
    return HttpResponse.json(MOCK_SEARCH_RESPONSE);
  }),
];

export const server = setupServer(...handlers);
