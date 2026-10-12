import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { GeolocationPosition } from '@/hooks/useGeolocation';

interface GpsCrosshairProps {
  map: MaplibreMap | null;
  position: GeolocationPosition | null;
}

export default function GpsCrosshair({
  map,
  position,
}: GpsCrosshairProps): JSX.Element | null {
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const hasPosition = position !== null;
  const lat = position?.lat ?? 0;
  const lng = position?.lng ?? 0;

  useEffect(() => {
    if (map === null || !hasPosition) {
      return undefined;
    }
    const element = document.createElement('div');
    element.setAttribute('data-testid', 'gps-crosshair');
    element.className = 'gps-crosshair';
    const marker = new maplibregl.Marker({ element, anchor: 'center' });
    marker.setLngLat([lng, lat]).addTo(map);
    markerRef.current = marker;
    return () => {
      marker.remove();
      markerRef.current = null;
    };
    // lat/lng celowo pominięte — zmiana pozycji obsłuży drugi efekt (bez odtwarzania markera)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, hasPosition]);

  useEffect(() => {
    if (markerRef.current !== null && hasPosition) {
      markerRef.current.setLngLat([lng, lat]);
    }
  }, [lat, lng, hasPosition]);

  return null;
}
