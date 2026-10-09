import { useEffect, useRef, useState } from 'react';

export interface GeolocationPosition {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export const AVERAGING_ACCURACY_OUTLIER_FACTOR = 2;
export const DEFAULT_AVERAGING_WINDOW_MS = 10_000;

export interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  watch?: boolean;
  averagingSamples?: number;
  averagingWindowMs?: number;
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

export function medianOf(values: number[]): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function averageSamples(
  samples: readonly GeolocationPosition[],
  timestamp: number,
): GeolocationPosition {
  const accuracies = samples.map((s) => s.accuracy);
  const medianAccuracy = medianOf(accuracies);
  const threshold = medianAccuracy * AVERAGING_ACCURACY_OUTLIER_FACTOR;
  const kept = samples.filter((s) => s.accuracy <= threshold);
  const keptAccuracies = kept.map((s) => s.accuracy);
  return {
    lat: medianOf(kept.map((s) => s.lat)),
    lng: medianOf(kept.map((s) => s.lng)),
    accuracy: medianOf(keptAccuracies),
    timestamp,
  };
}

interface WindowWithOptionalGeolocation {
  navigator?: {
    geolocation?: Geolocation;
  };
}

export function useGeolocation(options: UseGeolocationOptions = DEFAULT_OPTIONS): UseGeolocationResult {
  const {
    enableHighAccuracy = true,
    watch = false,
    averagingSamples = 1,
    averagingWindowMs = DEFAULT_AVERAGING_WINDOW_MS,
  } = options;
  const averaging = averagingSamples > 1;
  const useWatch = watch || averaging;
  const bufferRef = useRef<GeolocationPosition[]>([]);
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
      const reading: GeolocationPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      };
      if (averaging) {
        const buffer = bufferRef.current;
        buffer.push(reading);
        while (buffer.length > 0 && pos.timestamp - buffer[0].timestamp > averagingWindowMs) {
          buffer.shift();
        }
        while (buffer.length > averagingSamples) {
          buffer.shift();
        }
        setPosition(averageSamples(buffer, pos.timestamp));
      } else {
        bufferRef.current = [];
        setPosition(reading);
      }
      setLoading(false);
    };

    const onError = (err: GeolocationPositionError): void => {
      if (cancelled) {
        return;
      }
      setError(err.message);
      setLoading(false);
    };

    if (useWatch) {
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
  }, [enableHighAccuracy, useWatch, averaging, averagingSamples, averagingWindowMs, refreshKey]);

  return {
    position,
    error,
    loading,
    refresh: () => {
      bufferRef.current = [];
      setRefreshKey((k) => k + 1);
    },
  };
}
