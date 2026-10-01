import { useCallback } from 'react';
import type { Map as MaplibreMap } from 'maplibre-gl';
import MapView, { type TreeFeatureProperties } from './MapView';
import { useMapStore } from '@/stores/mapStore';
import { useParcelLookup } from '@/hooks/useAPI';
import type { Parcel, PolygonGeometry } from '@/services/api.types';

const DEFAULT_API_URL = 'http://localhost:8000/api/v1';
const DEFAULT_PMTILES_URL =
  import.meta.env.VITE_PMTILES_URL || `${import.meta.env.VITE_API_URL || DEFAULT_API_URL}/pmtiles/dzialki`;

function toGeoJSONPolygon(parcel: Parcel): GeoJSON.Polygon {
  if (parcel.geom.type !== 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: [],
    };
  }
  const polygon: PolygonGeometry = parcel.geom;
  return {
    type: 'Polygon',
    coordinates: polygon.coordinates.map((ring) =>
      ring.map(([lng, lat]) => [lng, lat] as [number, number]),
    ),
  };
}

interface MapClickHandlerProps {
  onMapReady?: (map: MaplibreMap) => void;
  treeLayer?: GeoJSON.FeatureCollection<GeoJSON.Point, TreeFeatureProperties> | null;
  onTreeClick?: (id: string) => void;
}

export default function MapClickHandler({
  onMapReady,
  treeLayer,
  onTreeClick,
}: MapClickHandlerProps = {}): JSX.Element {
  const selectedParcel = useMapStore((s) => s.selectedParcel);
  const highlightGeometry = selectedParcel ? toGeoJSONPolygon(selectedParcel) : null;
  const { lookup } = useParcelLookup();

  const handleMapClick = useCallback(
    ({ lat, lng }: { lat: number; lng: number }): void => {
      void lookup(lat, lng);
    },
    [lookup],
  );

  return (
    <MapView
      pmtilesUrl={DEFAULT_PMTILES_URL}
      onMapClick={handleMapClick}
      onMapReady={onMapReady}
      highlightGeometry={highlightGeometry}
      {...(treeLayer !== undefined ? { treeLayer } : {})}
      {...(onTreeClick !== undefined ? { onTreeClick } : {})}
    />
  );
}
