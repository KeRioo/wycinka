import { useCallback, useMemo, useRef, useState } from 'react';
import type { Map as MaplibreMap } from 'maplibre-gl';
import MapView, { type TreeFeatureProperties } from './MapView';
import { useMapStore } from '@/stores/mapStore';
import { useParcelLookup } from '@/hooks/useAPI';
import { useTreeStore } from '@/stores/treeStore';
import type { Parcel, PolygonGeometry } from '@/services/api.types';
import type { LatLng } from '@/lib/geo';
import { extractVertexPoints, snapThresholdMeters, snapToVertex, SNAP_THRESHOLD_M } from '@/lib/snap';

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
  onTreeClick?: (id: string, lngLat: { lng: number; lat: number }) => void;
}

function setPendingPosition(pos: LatLng): void {
  useTreeStore.getState().setPosition(pos.lat, pos.lng);
}

export default function MapClickHandler({
  onMapReady,
  treeLayer,
  onTreeClick,
}: MapClickHandlerProps = {}): JSX.Element {
  const selectedParcel = useMapStore((s) => s.selectedParcel);
  const mode = useTreeStore((s) => s.mode);
  const highlightGeometry = selectedParcel ? toGeoJSONPolygon(selectedParcel) : null;
  const { lookup } = useParcelLookup();

  const [map, setMap] = useState<MaplibreMap | null>(null);
  const stateRef = useRef({ mode, map });
  stateRef.current = { mode, map };

  const vertices = useMemo<LatLng[]>(
    () => (selectedParcel !== null ? extractVertexPoints(selectedParcel.geom) : []),
    [selectedParcel],
  );

  const handleMapReady = useCallback(
    (ready: MaplibreMap): void => {
      setMap(ready);
      stateRef.current = { ...stateRef.current, map: ready };
      onMapReady?.(ready);
    },
    [onMapReady],
  );

  const handleMapClick = useCallback(
    ({ lat, lng }: { lat: number; lng: number }): void => {
      if (stateRef.current.mode !== 'idle') {
        const { map: currentMap } = stateRef.current;
        const threshold =
          vertices.length > 0
            ? currentMap !== null
              ? snapThresholdMeters(currentMap.getZoom(), currentMap.getCenter().lat)
              : SNAP_THRESHOLD_M
            : SNAP_THRESHOLD_M;
        const snapped = snapToVertex({ lat, lng }, vertices, threshold);
        const pos = snapped !== null ? snapped.point : { lat, lng };
        setPendingPosition(pos);
        return;
      }
      void lookup(lat, lng);
    },
    [lookup, vertices],
  );

  const pendingDrag = useMemo(
    () =>
      mode === 'idle'
        ? null
        : {
            vertices,
            onMove: setPendingPosition,
            onEnd: setPendingPosition,
          },
    [mode, vertices],
  );

  return (
    <MapView
      pmtilesUrl={DEFAULT_PMTILES_URL}
      onMapClick={handleMapClick}
      onMapReady={handleMapReady}
      highlightGeometry={highlightGeometry}
      {...(treeLayer !== undefined ? { treeLayer } : {})}
      {...(onTreeClick !== undefined ? { onTreeClick } : {})}
      pendingDrag={pendingDrag}
    />
  );
}
