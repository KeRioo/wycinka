import { useEffect, useState } from 'react';

export interface GeolocationPosition {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  watch?: boolean;
}

interface UseGeolocationResult {
  position: GeolocationPosition | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

const DEFAULT_OPTIONS: UseGeolocationOptions = {
  enableHighAccuracy: true,
  watch: false,
};

interface WindowWithOptionalGeolocation {
  navigator?: {
    geolocation?: Geolocation;
  };
}

export function useGeolocation(options: UseGeolocationOptions = DEFAULT_OPTIONS): UseGeolocationResult {
  const { enableHighAccuracy = true, watch = false } = options;
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  useEffect(() => {
    const win = window as Window & WindowWithOptionalGeolocation;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const geo = win.navigator?.geolocation;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!geo) {
      setError('Geolokalizacja nie jest dostępna w tej przeglądarce');
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const onSuccess = (pos: globalThis.GeolocationPosition): void => {
      if (cancelled) {
        return;
      }
      setPosition({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      });
      setLoading(false);
    };

    const onError = (err: GeolocationPositionError): void => {
      if (cancelled) {
        return;
      }
      setError(err.message);
      setLoading(false);
    };

    if (watch) {
      const id = geo.watchPosition(onSuccess, onError, {
        enableHighAccuracy,
        maximumAge: 5_000,
        timeout: 30_000,
      });
      return () => {
        cancelled = true;
        geo.clearWatch(id);
      };
    }

    geo.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy,
      maximumAge: 60_000,
      timeout: 30_000,
    });

    return () => {
      cancelled = true;
    };
  }, [enableHighAccuracy, watch, refreshKey]);

  return {
    position,
    error,
    loading,
    refresh: () => {
      setRefreshKey((k) => k + 1);
    },
  };
}
