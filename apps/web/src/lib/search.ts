import { api } from '@/services/api';
import { ApiError } from '@/services/api.types';
import type { SearchResult } from '@/services/api.types';
import { useMapStore } from '@/stores/mapStore';
import { ensureActiveProject } from '@/stores/projectStore';

const ERROR_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.',
  TIMEOUT: 'Wyszukiwanie przekroczyło czas oczekiwania. Spróbuj ponownie.',
  DB_UNAVAILABLE: 'Baza danych niedostępna. Spróbuj później.',
  BAD_REQUEST: 'Nieprawidłowe zapytanie. Wpisz numer działki lub TERYT.',
};

export function mapApiErrorToMessage(error: ApiError): string {
  return ERROR_MESSAGES[error.code] ?? 'Błąd wyszukiwania. Spróbuj ponownie.';
}

export async function selectSearchResult(result: SearchResult): Promise<void> {
  const parcel = await api.getParcelByTeryt(result.teryt);
  if (!parcel.found) {
    throw new ApiError('PARCEL_NOT_FOUND', 'Nie udało się pobrać danych działki', 404);
  }
  const mapStore = useMapStore.getState();
  mapStore.setSelectedParcel(parcel.parcel);
  mapStore.requestFocus({
    lat: parcel.parcel.centroid[1],
    lng: parcel.parcel.centroid[0],
  });
  await ensureActiveProject();
}
