import { RefreshCw, MapPin } from 'lucide-react';
import { classifyAccuracy, formatLatLng } from '@/lib/geo';
import { cn } from '@/lib/utils';

interface GpsIndicatorProps {
  position: { lat: number; lng: number; accuracy: number } | null;
  loading: boolean;
  error: string | null;
  onRefresh?: () => void;
}

const ACCURACY_LABEL: Record<'good' | 'medium' | 'poor', string> = {
  good: 'dobra',
  medium: 'średnia',
  poor: 'słaba',
};

const ACCURACY_CLASS: Record<'good' | 'medium' | 'poor', string> = {
  good: 'bg-forest-100 text-forest-800 border-forest-300',
  medium: 'bg-amber-100 text-amber-900 border-amber-300',
  poor: 'bg-red-100 text-red-800 border-red-300',
};

export default function GpsIndicator({
  position,
  loading,
  error,
  onRefresh,
}: GpsIndicatorProps): JSX.Element {
  if (error !== null) {
    return (
      <div
        data-testid="gps-indicator-error"
        className="flex items-center justify-between gap-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
      >
        <span className="flex items-center gap-2">
          <MapPin aria-hidden="true" className="h-4 w-4" />
          GPS: {error}
        </span>
        {onRefresh !== undefined && (
          <button
            type="button"
            aria-label="Odśwież GPS"
            onClick={onRefresh}
            className="rounded p-1 text-red-700 hover:bg-red-100"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  if (position === null) {
    return (
      <div
        data-testid="gps-indicator-loading"
        className="flex items-center gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600"
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block h-3 w-3 rounded-full border-2 border-forest-500 border-t-transparent',
            loading ? 'animate-spin' : 'opacity-40',
          )}
        />
        <span>Pobieranie pozycji GPS…</span>
        {onRefresh !== undefined && (
          <button
            type="button"
            aria-label="Odśwież GPS"
            onClick={onRefresh}
            className="ml-auto rounded p-1 text-forest-700 hover:bg-forest-50"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  const accClass = classifyAccuracy(position.accuracy);

  return (
    <div
      data-testid="gps-indicator"
      className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm"
    >
      <div className="min-w-0 flex-1">
        <p
          data-testid="gps-coords"
          className="truncate font-mono text-xs text-forest-900"
        >
          {formatLatLng(position.lat, position.lng)}
        </p>
        <p className="text-xs text-stone-500">
          Dokładność: <span className="font-medium">{position.accuracy.toFixed(0)} m</span>
        </p>
      </div>
      <span
        data-testid="gps-accuracy-badge"
        className={cn(
          'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium',
          ACCURACY_CLASS[accClass],
        )}
      >
        {ACCURACY_LABEL[accClass]}
      </span>
      {onRefresh !== undefined && (
        <button
          type="button"
          aria-label="Odśwież GPS"
          onClick={onRefresh}
          className="shrink-0 rounded p-1 text-forest-700 hover:bg-forest-50"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
