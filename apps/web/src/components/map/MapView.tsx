import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MaplibreMap, type MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { usePMTiles } from './usePMTiles';

interface MapViewProps {
  pmtilesUrl: string;
  initialCenter?: readonly [number, number];
  initialZoom?: number;
  highlightGeometry?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  onMapClick?: (point: { lat: number; lng: number }) => void;
  onMapReady?: (map: MaplibreMap) => void;
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

export default function MapView({
  pmtilesUrl,
  initialCenter = DEFAULT_CENTER,
  initialZoom = DEFAULT_ZOOM,
  highlightGeometry,
  onMapClick,
  onMapReady,
  className,
}: MapViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [styleLoaded, setStyleLoaded] = useState<boolean>(false);

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
      map.addSource('highlight', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'highlight-fill',
        type: 'fill',
        source: 'highlight',
        paint: {
          'fill-color': '#facc15',
          'fill-opacity': 0.4,
        },
      });
      map.addLayer({
        id: 'highlight-outline',
        type: 'line',
        source: 'highlight',
        paint: {
          'line-color': '#ca8a04',
          'line-width': 2,
        },
      });
      setStyleLoaded(true);
      onMapReady?.(map);
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
      setStyleLoaded(false);
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

  return <div ref={containerRef} className={className ?? 'h-full w-full'} data-testid="map-container" />;
}
