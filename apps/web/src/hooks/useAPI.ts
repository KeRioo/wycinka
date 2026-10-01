import { useCallback, useEffect, useState } from 'react';
import { ApiError, type ParcelResponse } from '@/services/api.types';
import { api } from '@/services/api';
import { useMapStore } from '@/stores/mapStore';

interface UseParcelLookupResult {
  loading: boolean;
  error: string | null;
  data: ParcelResponse | null;
  lookup: (lat: number, lng: number) => Promise<void>;
  reset: () => void;
}

export function useParcelLookup(): UseParcelLookupResult {
  const [data, setData] = useState<ParcelResponse | null>(null);
  const setLoading = useMapStore((s) => s.setLoading);
  const setError = useMapStore((s) => s.setError);
  const setSelected = useMapStore((s) => s.setSelectedParcel);

  const lookup = useCallback(
    async (lat: number, lng: number): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.getParcelByPoint(lat, lng);
        setData(response);
        if (response.found) {
          setSelected(response.parcel);
        } else {
          setSelected(null);
        }
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Nieznany błąd';
        setError(message);
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [setError, setLoading, setSelected],
  );

  const reset = useCallback(() => {
    setData(null);
  }, []);

  useEffect(() => {
    return () => {
      setLoading(false);
      setError(null);
    };
  }, [setError, setLoading]);

  return { loading: false, error: null, data, lookup, reset };
}
