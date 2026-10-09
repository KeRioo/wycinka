import { useCallback, useMemo, useRef, useState } from 'react';
import type { Map as MaplibreMap } from 'maplibre-gl';
import MapView, { type TreeFeatureProperties } from './MapView';
import { useMapStore } from '@/stores/mapStore';
import { useParcelLookup } from '@/hooks/useAPI';
import { useTreeStore } from '@/stores/treeStore';
import type { Parcel } from '@/services/api.types';
import { useProjectStore } from '@/stores/projectStore';
import type { LatLng } from '@/lib/geo';
import {
  extractVertexPoints,
  snapThresholdMeters,
  snapToVertex,
  SNAP_THRESHOLD_M,
} from '@/lib/snap';

const DEFAULT_API_URL = 'http://localhost:8000/api/v1';
const DEFAULT_PMTILES_URL =
  import.meta.env.VITE_PMTILES_URL ||
  `${import.meta.env.VITE_API_URL || DEFAULT_API_URL}/pmtiles/dzialki`;

function toGeoJSONPolygon(parcel: Parcel): GeoJSON.Polygon {
  if (parcel.geom.type !== 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: [],
    };
  }
  return parcelGeomToGeoJSON(parcel.geom) as GeoJSON.Polygon;
}

function parcelGeomToGeoJSON(geom: Parcel['geom']): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  if (geom.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geom.coordinates.map((ring) =>
        ring.map(([lng, lat]) => [lng, lat] as [number, number]),
      ),
    };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geom.coordinates.map((polygon) =>
      polygon.map((ring) => ring.map(([lng, lat]) => [lng, lat] as [number, number])),
    ),
  };
}

function parcelsToFeatureCollection(
  parcels: readonly Parcel[],
): GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  return {
    type: 'FeatureCollection',
    features: parcels.map((parcel) => ({
      type: 'Feature',
      geometry: parcelGeomToGeoJSON(parcel.geom),
      properties: { teryt: parcel.teryt },
    })),
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
  const projectParcels = useProjectStore((s) => s.projectParcels);
  const mode = useTreeStore((s) => s.mode);
  const highlightGeometry = selectedParcel ? toGeoJSONPolygon(selectedParcel) : null;
  const projectParcelsGeometry = useMemo(
    () => parcelsToFeatureCollection(projectParcels),
    [projectParcels],
  );
  const { lookup } = useParcelLookup();

  const [map, setMap] = useState<MaplibreMap | null>(null);
  const vertices = useMemo<LatLng[]>(
    () => (selectedParcel !== null ? extractVertexPoints(selectedParcel.geom) : []),
    [selectedParcel],
  );
  const stateRef = useRef({ mode, map, vertices });
  stateRef.current = { mode, map, vertices };

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
        const { map: currentMap, vertices: currentVertices } = stateRef.current;
        const threshold =
          currentVertices.length > 0 && currentMap !== null
            ? snapThresholdMeters(currentMap.getZoom(), currentMap.getCenter().lat)
            : SNAP_THRESHOLD_M;
        const snapped = snapToVertex({ lat, lng }, currentVertices, threshold);
        const pos = snapped !== null ? snapped.point : { lat, lng };
        setPendingPosition(pos);
        return;
      }
      void lookup(lat, lng);
    },
    [lookup],
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
      projectParcelsGeometry={projectParcelsGeometry}
      {...(treeLayer !== undefined ? { treeLayer } : {})}
      {...(onTreeClick !== undefined ? { onTreeClick } : {})}
      pendingDrag={pendingDrag}
    />
  );
}
