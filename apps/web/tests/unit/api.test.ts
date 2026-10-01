import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import { api } from '@/services/api';
import { ApiError } from '@/services/api.types';
import { MOCK_PARCEL_FOUND, MOCK_SEARCH_RESPONSE, MOCK_VERSION } from '@/test/mocks/api-responses';

const MOCK_PARCEL = MOCK_PARCEL_FOUND.found ? MOCK_PARCEL_FOUND.parcel : null;

describe('api client', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('getVersion', () => {
    it('should return version when endpoint responds', async () => {
      const result = await api.getVersion();
      expect(result).toEqual(MOCK_VERSION);
    });

    it('should throw ApiError when backend fails', async () => {
      server.use(
        http.get('*/api/v1/version', () => HttpResponse.error()),
      );
      await expect(api.getVersion()).rejects.toThrowError(ApiError);
    });
  });

  describe('getParcelByPoint', () => {
    it('should return parcel when coordinates match known point', async () => {
      const result = await api.getParcelByPoint(52.23, 21.01);
      expect(result.found).toBe(true);
      if (result.found && MOCK_PARCEL) {
        expect(result.parcel.id).toBe(MOCK_PARCEL.id);
      }
    });

    it('should return not found when coordinates do not match', async () => {
      const result = await api.getParcelByPoint(50.0, 19.0);
      expect(result.found).toBe(false);
      if (!result.found) {
        expect(result.nearby_parcels).toHaveLength(1);
      }
    });

    it('should throw BAD_REQUEST when coordinates out of range', async () => {
      await expect(api.getParcelByPoint(91, 0)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('should throw ApiError when backend returns 503', async () => {
      server.use(
        http.get('*/api/v1/parcel', () =>
          HttpResponse.json(
            { error: 'Database unavailable', code: 'DB_UNAVAILABLE', details: {} },
            { status: 503 },
          ),
        ),
      );
      await expect(api.getParcelByPoint(52.23, 21.01)).rejects.toMatchObject({
        code: 'DB_UNAVAILABLE',
        status: 503,
      });
    });
  });

  describe('getParcelByTeryt', () => {
    it('should return parcel for valid TERYT', async () => {
      const result = await api.getParcelByTeryt('141201_1.0001.6509');
      expect(result.found).toBe(true);
    });

    it('should throw PARCEL_NOT_FOUND when TERYT not in database', async () => {
      await expect(api.getParcelByTeryt('999999_9.9999.9999')).rejects.toMatchObject({
        code: 'PARCEL_NOT_FOUND',
      });
    });
  });

  describe('searchParcels', () => {
    it('should return search results for valid query', async () => {
      const result = await api.searchParcels('141201');
      expect(result).toEqual(MOCK_SEARCH_RESPONSE);
    });

    it('should throw BAD_REQUEST for empty query', async () => {
      await expect(api.searchParcels('   ')).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('should throw BAD_REQUEST for query exceeding 256 chars', async () => {
      const longQuery = 'a'.repeat(257);
      await expect(api.searchParcels(longQuery)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('should clamp limit to max 50', async () => {
      const result = await api.searchParcels('test', 1000);
      expect(result).toBeDefined();
    });
  });

  describe('aggregateParcels', () => {
    it('should throw BAD_REQUEST for empty ids array', async () => {
      await expect(api.aggregateParcels([])).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    });

    it('should return aggregate geometry for valid ids', async () => {
      const result = await api.aggregateParcels(['141201_1.0001.6509']);
      expect(result.parcels).toContain('141201_1.0001.6509');
    });
  });
});

