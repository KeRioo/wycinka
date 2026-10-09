import type maplibregl from 'maplibre-gl';

export const DZIALKI_MIN_ZOOM = 15;
export const DZIALKI_FILL_MIN_ZOOM = 17;

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

export function buildStyleWithPMTiles(pmtilesUrl: string): maplibregl.StyleSpecification {
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
        data: { type: 'FeatureCollection', features: [] },
      },
      highlight: {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      },
      parcels: {
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
        minzoom: DZIALKI_FILL_MIN_ZOOM,
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
        minzoom: DZIALKI_MIN_ZOOM,
        paint: {
          'line-color': '#15803d',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            DZIALKI_MIN_ZOOM,
            0.6,
            20,
            1.5,
          ],
          'line-opacity': 0.8,
        },
      },
      {
        id: 'parcels-fill',
        type: 'fill',
        source: 'parcels',
        paint: {
          'fill-color': '#166534',
          'fill-opacity': 0.15,
        },
      },
      {
        id: 'parcels-outline',
        type: 'line',
        source: 'parcels',
        paint: {
          'line-color': '#1e3a8a',
          'line-width': 2,
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
