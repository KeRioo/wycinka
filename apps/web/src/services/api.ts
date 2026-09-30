import ky, { HTTPError, type KyInstance } from 'ky';
import {
  ApiError,
  type ApiErrorCode,
  type ApiErrorResponse,
  type HealthResponse,
  type ParcelAggregateResponse,
  type ParcelResponse,
  type SearchResponse,
  type VersionResponse,
} from './api.types';

const DEFAULT_TIMEOUT = 10_000;
const MAX_SEARCH_RESULTS = 50;

function mapStatusToCode(status: number): ApiErrorCode {
  if (status === 400) {
    return 'BAD_REQUEST';
  }
  if (status === 404) {
    return 'PARCEL_NOT_FOUND';
  }
  if (status === 422) {
    return 'INVALID_TERYT';
  }
  if (status === 503) {
    return 'DB_UNAVAILABLE';
  }
  return status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN';
}

async function readJsonBody(response: Response): Promise<Partial<ApiErrorResponse> | null> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return null;
  }
  try {
    return (await response.clone().json()) as Partial<ApiErrorResponse>;
  } catch {
    return null;
  }
}

async function buildApiError(error: unknown): Promise<ApiError> {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof HTTPError) {
    const { response } = error;
    const body = await readJsonBody(response);
    const code: ApiErrorCode = (body?.code as ApiErrorCode | undefined) ?? mapStatusToCode(response.status);
    const fallbackMessage = response.statusText || `HTTP ${String(response.status)}`;
    const message = body?.error ?? fallbackMessage;
    const details = body?.details;
    return new ApiError(
      code,
      message,
      response.status,
      details && typeof details === 'object' ? details : undefined,
    );
  }
  if (error instanceof Error) {
    if (error.name === 'TimeoutError') {
      return new ApiError('TIMEOUT', `Żądanie przekroczyło czas oczekiwania: ${error.message}`, 0);
    }
    return new ApiError('NETWORK_ERROR', error.message, 0);
  }
  return new ApiError('UNKNOWN', 'Nieznany błąd', 0);
}

function createClient(baseUrl: string): KyInstance {
  return ky.create({
    prefixUrl: baseUrl,
    timeout: DEFAULT_TIMEOUT,
    retry: {
      limit: 2,
      methods: ['get'],
      statusCodes: [408, 429, 500, 502, 503, 504],
    },
  });
}

const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const apiBase = apiBaseUrl.replace(/\/api\/v\d+$/, '');
const httpClient = createClient(apiBaseUrl);

export const api = {
  async getHealth(): Promise<HealthResponse> {
    try {
      return await ky.get(`${apiBase}/health`, { timeout: DEFAULT_TIMEOUT }).json<HealthResponse>();
    } catch (error) {
      throw await buildApiError(error);
    }
  },

  async getVersion(): Promise<VersionResponse> {
    try {
      return await httpClient.get('version').json<VersionResponse>();
    } catch (error) {
      throw await buildApiError(error);
    }
  },

  async getParcelByPoint(lat: number, lng: number): Promise<ParcelResponse> {
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new ApiError('BAD_REQUEST', 'Współrzędne poza zakresem', 400, { lat, lng });
    }
    try {
      return await httpClient
        .get('parcel', { searchParams: { lat: String(lat), lng: String(lng) } })
        .json<ParcelResponse>();
    } catch (error) {
      throw await buildApiError(error);
    }
  },

  async getParcelByTeryt(teryt: string): Promise<ParcelResponse> {
    try {
      return await httpClient.get(`parcel/${encodeURIComponent(teryt)}`).json<ParcelResponse>();
    } catch (error) {
      throw await buildApiError(error);
    }
  },

  async aggregateParcels(ids: readonly string[]): Promise<ParcelAggregateResponse> {
    if (ids.length === 0) {
      throw new ApiError('BAD_REQUEST', 'Lista ID jest pusta', 400);
    }
    try {
      return await httpClient
        .get('parcel/aggregate', { searchParams: { id: ids.join(',') } })
        .json<ParcelAggregateResponse>();
    } catch (error) {
      throw await buildApiError(error);
    }
  },

  async searchParcels(query: string, limit = 10): Promise<SearchResponse> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      throw new ApiError('BAD_REQUEST', 'Zapytanie wyszukiwarki jest puste', 400);
    }
    if (trimmed.length > 256) {
      throw new ApiError('BAD_REQUEST', 'Zapytanie wyszukiwarki jest za długie (max 256 znaków)', 400);
    }
    const safeLimit = Math.min(Math.max(1, limit), MAX_SEARCH_RESULTS);
    try {
      return await httpClient
        .get('search', { searchParams: { q: trimmed, limit: String(safeLimit) } })
        .json<SearchResponse>();
    } catch (error) {
      throw await buildApiError(error);
    }
  },
};

export type Api = typeof api;
