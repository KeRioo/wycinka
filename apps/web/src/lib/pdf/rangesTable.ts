import type { RangeConfig, Tree } from '@/db/schema';
import type { SpeciesConfig } from '@/db/schema';
import { getSpeciesColor } from '@/lib/geo';

export interface RangesRow {
  species: string;
  color: string;
  counts: number[];
  total: number;
}

export interface RangesTable {
  columns: readonly string[];
  rows: readonly RangesRow[];
}

const UNCLASSIFIED_LABEL = 'Inne';

export function rangeIndexOf(circumference: number, ranges: readonly RangeConfig[]): number {
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (circumference >= range.from && circumference < range.to) {
      return i;
    }
  }
  return ranges.length - 1;
}

export function buildRangesTable(
  trees: readonly Tree[],
  speciesConfig: readonly SpeciesConfig[],
  rangesConfig: readonly RangeConfig[],
): RangesTable {
  const knownSpecies = new Map<string, SpeciesConfig>(
    speciesConfig.map((species) => [species.name, species]),
  );

  const bucketed = new Map<string, number[]>();
  for (const tree of trees) {
    const key = knownSpecies.has(tree.species) ? tree.species : UNCLASSIFIED_LABEL;
    const counts = bucketed.get(key) ?? rangesConfig.map(() => 0);
    counts[rangeIndexOf(tree.circumference, rangesConfig)] += 1;
    bucketed.set(key, counts);
  }

  const orderedKeys = [
    ...speciesConfig.map((species) => species.name).filter((name) => bucketed.has(name)),
    ...[...bucketed.keys()].filter((name) => !speciesConfig.some((s) => s.name === name)),
  ];

  const rows = orderedKeys.map((species) => {
    const counts = bucketed.get(species) ?? rangesConfig.map(() => 0);
    const color = getSpeciesColor(species);
    return {
      species,
      color,
      counts,
      total: counts.reduce((sum, count) => sum + count, 0),
    };
  });

  return {
    columns: [...rangesConfig.map((range) => range.label), 'Razem'],
    rows,
  };
}

export interface ProjectSummary {
  treeCount: number;
  totalCircumference: number;
}

export function buildSummary(trees: readonly Tree[]): ProjectSummary {
  return {
    treeCount: trees.length,
    totalCircumference: trees.reduce((sum, tree) => sum + tree.circumference, 0),
  };
}

export interface NumberedRow {
  nr: number;
  species: string;
  color: string;
  circumference: number;
  location: string;
}

export function buildNumberedRows(trees: readonly Tree[]): NumberedRow[] {
  const sorted = [...trees].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  return sorted.map((tree, index) => ({
    nr: index + 1,
    species: tree.species,
    color: getSpeciesColor(tree.species),
    circumference: tree.circumference,
    location: `${tree.lat.toFixed(5)}, ${tree.lng.toFixed(5)}`,
  }));
}
