import { useState } from 'react';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { Ruler } from 'lucide-react';
import GpsTroubleshootModal from './GpsTroubleshootModal';
import { zoomForScale20M } from './mapControlUtils';
import type { GeolocationPosition } from '@/hooks/useGeolocation';

const FLY_TO_DURATION_MS = 500;

interface MapControlsProps {
  map: MaplibreMap | null;
  position: GeolocationPosition | null;
  onRetryGps: () => void;
}

export default function MapControls({
  map,
  position,
  onRetryGps,
}: MapControlsProps): JSX.Element {
  const [troubleshootOpen, setTroubleshootOpen] = useState(false);
  const gpsAvailable = position !== null;

  const handleClick = (): void => {
    if (position === null) {
      setTroubleshootOpen(true);
      return;
    }
    if (map === null) {
      return;
    }
    map.flyTo({
      center: [position.lng, position.lat],
      zoom: zoomForScale20M(window.innerWidth, window.innerHeight, position.lat),
      duration: FLY_TO_DURATION_MS,
    });
  };

  const buttonClasses = gpsAvailable
    ? 'absolute right-[10px] top-[152px] z-10 flex h-11 w-11 items-center justify-center rounded-lg border border-forest-200 bg-white text-forest-700 shadow-md hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500'
    : 'absolute right-[10px] top-[152px] z-10 flex h-11 w-11 items-center justify-center rounded-lg border border-red-700 bg-red-600 text-white shadow-md hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400';

  return (
    <>
      <button
        type="button"
        data-testid="map-scale-to-gps"
        data-active={gpsAvailable ? 'true' : 'false'}
        title="Skaluj mapę do 20 m"
        aria-label="Skaluj mapę do 20 m"
        onClick={handleClick}
        className={buttonClasses}
      >
        <Ruler aria-hidden="true" className="h-5 w-5" />
      </button>

      <GpsTroubleshootModal
        open={troubleshootOpen}
        onClose={() => {
          setTroubleshootOpen(false);
        }}
        onRetry={onRetryGps}
      />
    </>
  );
}
