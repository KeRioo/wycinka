import { useCallback, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import maplibregl, { type Map as MaplibreMap } from 'maplibre-gl';
import MapClickHandler from '@/components/map/MapClickHandler';
import ParcelPopup from '@/components/map/ParcelPopup';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMapStore } from '@/stores/mapStore';

const DEFAULT_ZOOM = 13;

export default function MapPage(): JSX.Element {
  const mapRef = useRef<MaplibreMap | null>(null);
  const popupRootRef = useRef<Root | null>(null);
  const popupContainerRef = useRef<HTMLDivElement | null>(null);
  const selectedParcel = useMapStore((s) => s.selectedParcel);
  const isLoading = useMapStore((s) => s.isLoading);
  const error = useMapStore((s) => s.error);
  const setSelected = useMapStore((s) => s.setSelectedParcel);
  const setError = useMapStore((s) => s.setError);

  const handleMapReady = useCallback((map: MaplibreMap) => {
    mapRef.current = map;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (!selectedParcel) {
      popupRootRef.current?.unmount();
      popupRootRef.current = null;
      if (popupContainerRef.current) {
        popupContainerRef.current.innerHTML = '';
      }
      return;
    }

    popupContainerRef.current ??= document.createElement('div');

    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      offset: 12,
      maxWidth: '320px',
    })
      .setLngLat([selectedParcel.centroid[0], selectedParcel.centroid[1]])
      .setDOMContent(popupContainerRef.current)
      .addTo(map);

    popupRootRef.current ??= createRoot(popupContainerRef.current);
    popupRootRef.current.render(<ParcelPopup parcel={selectedParcel} />);

    map.flyTo({
      center: [selectedParcel.centroid[0], selectedParcel.centroid[1]],
      zoom: DEFAULT_ZOOM,
      duration: 800,
    });

    return () => {
      popup.remove();
    };
  }, [selectedParcel]);

  return (
    <div className="relative h-full w-full">
      <MapClickHandler onMapReady={handleMapReady} />
      <aside className="pointer-events-none absolute left-4 top-4 max-w-sm space-y-2">
        {isLoading && (
          <Card className="pointer-events-auto">
            <CardContent className="flex items-center gap-3 p-3 text-sm text-forest-700">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-forest-500 border-t-transparent"
              />
              Wyszukiwanie działki…
            </CardContent>
          </Card>
        )}
        {error !== null && (
          <Card className="pointer-events-auto border-red-300 bg-red-50">
            <CardContent className="space-y-2 p-3 text-sm text-red-800">
              <p className="font-medium">Błąd</p>
              <p>{error}</p>
              <Button size="sm" variant="secondary" onClick={() => { setError(null); }}>
                Zamknij
              </Button>
            </CardContent>
          </Card>
        )}
        {selectedParcel && (
          <Card className="pointer-events-auto">
            <CardHeader className="flex flex-row items-center justify-between gap-2 p-3">
              <CardTitle className="text-sm">Wybrana działka</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => { setSelected(null); }}>
                Zamknij
              </Button>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <ParcelPopup parcel={selectedParcel} />
            </CardContent>
          </Card>
        )}
      </aside>
      <noscript className="absolute inset-0 flex items-center justify-center bg-stone-100 p-4 text-center">
        <p className="text-stone-700">Mapa wymaga włączonej obsługi JavaScript.</p>
      </noscript>
    </div>
  );
}
