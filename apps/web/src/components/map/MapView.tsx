import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MaplibreMap, type MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { usePMTiles } from './usePMTiles';
import { usePendingMarkerDrag } from './usePendingDrag';
import type { LatLng } from '@/lib/geo';

export interface TreeFeatureProperties {
  id: string;
  species: string;
  speciesColor: string;
  circumference: number;
  circumferencePx: number;
  pending?: boolean;
}

interface MapViewProps {
  pmtilesUrl: string;
  initialCenter?: readonly [number, number];
  initialZoom?: number;
  highlightGeometry?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  treeLayer?: GeoJSON.FeatureCollection<GeoJSON.Point, TreeFeatureProperties> | null;
  onMapClick?: (point: { lat: number; lng: number }) => void;
  onMapReady?: (map: MaplibreMap) => void;
  onTreeClick?: (id: string, lngLat: { lng: number; lat: number }) => void;
  pendingDrag?: {
    vertices: readonly LatLng[];
    onMove: (pos: LatLng) => void;
    onEnd: (pos: LatLng) => void;
  } | null;
  className?: string;
}

const DEFAULT_CENTER: readonly [number, number] = [21.0122, 52.2297];
const DEFAULT_ZOOM = 6;

const BASE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm-base',
      type: 'raster',
      source: 'osm',
    },
  ],
};

function buildStyleWithPMTiles(pmtilesUrl: string): maplibregl.StyleSpecification {
  return {
    ...BASE_STYLE,
    sources: {
      ...BASE_STYLE.sources,
      dzialki: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
      },
      trees: {
        type: 'geojson',
        data: emptyFeatureCollection(),
      },
      highlight: {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      },
      'snap-indicator': {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      },
    },
    layers: [
      ...BASE_STYLE.layers,
      {
        id: 'dzialki-fill',
        type: 'fill',
        source: 'dzialki',
        'source-layer': 'dzialki',
        paint: {
          'fill-color': '#22c55e',
          'fill-opacity': 0.2,
          'fill-outline-color': '#15803d',
        },
      },
      {
        id: 'dzialki-outline',
        type: 'line',
        source: 'dzialki',
        'source-layer': 'dzialki',
        paint: {
          'line-color': '#15803d',
          'line-width': 0.5,
          'line-opacity': 0.7,
        },
      },
      {
        id: 'highlight-fill',
        type: 'fill',
        source: 'highlight',
        paint: {
          'fill-color': '#facc15',
          'fill-opacity': 0.4,
        },
      },
      {
        id: 'highlight-outline',
        type: 'line',
        source: 'highlight',
        paint: {
          'line-color': '#ca8a04',
          'line-width': 2,
        },
      },
      {
        id: 'trees-circle',
        type: 'circle',
        source: 'trees',
        filter: ['!=', ['get', 'pending'], true],
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'circumferencePx'],
            6, 6,
            18, 18,
          ],
          'circle-color': ['get', 'speciesColor'],
          'circle-stroke-color': '#15803d',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.85,
        },
      },
      {
        id: 'trees-pending-circle',
        type: 'circle',
        source: 'trees',
        filter: ['==', ['get', 'pending'], true],
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'circumferencePx'],
            6, 8,
            18, 16,
          ],
          'circle-color': '#dc2626',
          'circle-stroke-color': '#fef2f2',
          'circle-stroke-width': 2,
          'circle-opacity': 0.75,
        },
      },
      {
        id: 'snap-indicator-ring',
        type: 'circle',
        source: 'snap-indicator',
        paint: {
          'circle-radius': 9,
          'circle-color': '#0ea5e9',
          'circle-opacity': 0.25,
          'circle-stroke-color': '#0284c7',
          'circle-stroke-width': 2,
        },
      },
    ],
  };
}

function highlightSourceData(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: geom,
        properties: {},
      },
    ],
  };
}

function emptyFeatureCollection(): GeoJSON.FeatureCollection<GeoJSON.Point, TreeFeatureProperties> {
  return { type: 'FeatureCollection', features: [] };
}

export default function MapView({
  pmtilesUrl,
  initialCenter = DEFAULT_CENTER,
  initialZoom = DEFAULT_ZOOM,
  highlightGeometry,
  treeLayer,
  onMapClick,
  onMapReady,
  onTreeClick,
  pendingDrag = null,
  className,
}: MapViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const onTreeClickRef = useRef<typeof onTreeClick>(onTreeClick);
  const [styleLoaded, setStyleLoaded] = useState<boolean>(false);
  const [map, setMap] = useState<MaplibreMap | null>(null);
  const pendingDragRef = useRef(pendingDrag);
  pendingDragRef.current = pendingDrag;

  usePendingMarkerDrag({
    map,
    ready: styleLoaded,
    enabled: pendingDrag !== null,
    vertices: pendingDrag?.vertices ?? [],
    onMove: (pos) => pendingDragRef.current?.onMove(pos),
    onEnd: (pos) => pendingDragRef.current?.onEnd(pos),
  });

  onTreeClickRef.current = onTreeClick;

  usePMTiles(pmtilesUrl);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyleWithPMTiles(pmtilesUrl),
      center: [initialCenter[0], initialCenter[1]],
      zoom: initialZoom,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      map.on('click', 'trees-circle', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['trees-circle'] });
        const first = features.length > 0 ? features[0] : undefined;
        if (first === undefined) {
          e.preventDefault();
          return;
        }
        const props = first.properties as Record<string, unknown>;
        const id = props.id;
        if (typeof id === 'string') {
          const [lng, lat] = (first.geometry as GeoJSON.Point).coordinates;
          onTreeClickRef.current?.(id, { lng, lat });
        }
        e.preventDefault();
      });

      map.on('mouseenter', 'trees-circle', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'trees-circle', () => {
        map.getCanvas().style.cursor = '';
      });

      setStyleLoaded(true);
      setMap(map);
      onMapReady?.(map);
      if (import.meta.env.MODE !== 'production') {
        (window as unknown as Record<string, unknown>).wycinkaMap = map;
      }
    });

    const handleClick = (e: MapLayerMouseEvent): void => {
      if (!onMapClick) {
        return;
      }
      onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    };

    map.on('click', handleClick);

    mapRef.current = map;

    return () => {
      map.off('click', handleClick);
      map.remove();
      mapRef.current = null;
      setMap(null);
      setStyleLoaded(false);
      if (import.meta.env.MODE !== 'production') {
        delete (window as unknown as Record<string, unknown>).wycinkaMap;
      }
    };
  }, [pmtilesUrl, initialCenter, initialZoom, onMapClick, onMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) {
      return;
    }
    const source = map.getSource<maplibregl.GeoJSONSource>('highlight');
    if (!source) {
      return;
    }
    if (highlightGeometry) {
      source.setData(highlightSourceData(highlightGeometry));
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [highlightGeometry, styleLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) {
      return;
    }
    const source = map.getSource<maplibregl.GeoJSONSource>('trees');
    if (!source) {
      return;
    }
    source.setData(treeLayer ?? emptyFeatureCollection());
  }, [treeLayer, styleLoaded]);

  return (
    <div
      ref={containerRef}
      className={className ?? 'h-full w-full'}
      data-testid="map-container"
      data-loaded={styleLoaded ? 'true' : 'false'}
    />
  );
}
