import type { Tree } from '@/db/schema';
import { DEFAULT_PDF_PREFS, DEFAULT_SPECIES } from '@/db/schema';
import { getSpeciesColor, markerSizeForCm } from '@/lib/geo';

export interface TreeFeatureProperties {
  id: string;
  species: string;
  speciesColor: string;
  circumference: number;
  circumferencePx: number;
  pending?: boolean;
}

const speciesColorLookup = new Map<string, string>(
  DEFAULT_SPECIES.map((s) => [s.name, s.color]),
);

export function treeToFeature(
  tree: Tree,
  options?: { pending?: boolean },
): GeoJSON.Feature<GeoJSON.Point, TreeFeatureProperties> {
  const color = getSpeciesColor(tree.species, speciesColorLookup.get(tree.species) ?? '#6b7280');
  const px = markerSizeForCm(tree.circumference, DEFAULT_PDF_PREFS.markerScale);
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [tree.lng, tree.lat] },
    properties: {
      id: tree.id,
      species: tree.species,
      speciesColor: color,
      circumference: tree.circumference,
      circumferencePx: px,
      ...(options?.pending === true ? { pending: true } : {}),
    },
  };
}

export function treesToFeatureCollection(
  trees: readonly Tree[],
  pending: GeoJSON.Feature<GeoJSON.Point, TreeFeatureProperties> | null = null,
): GeoJSON.FeatureCollection<GeoJSON.Point, TreeFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: [...trees.map((t) => treeToFeature(t)), ...(pending ? [pending] : [])],
  };
}

export function buildPendingFeature(
  lat: number,
  lng: number,
  species: string,
  circumference: number,
): GeoJSON.Feature<GeoJSON.Point, TreeFeatureProperties> {
  const color = getSpeciesColor(species, '#dc2626');
  const px = markerSizeForCm(circumference > 0 ? circumference : 50, DEFAULT_PDF_PREFS.markerScale);
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      id: 'pending',
      species: species || 'pending',
      speciesColor: color,
      circumference: circumference > 0 ? circumference : 50,
      circumferencePx: px,
      pending: true,
    },
  };
}
