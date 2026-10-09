import type { Project, Tree } from '@/db/schema';
import { DEFAULT_PDF_PREFS, DEFAULT_SPECIES, DEFAULT_RANGES } from '@/db/schema';
import type { Parcel } from '@/services/api.types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PdfMapPreview from '@/components/pdf/PdfMapPreview';

const PROJECT: Project = {
  id: 'p-1',
  name: 'Las Wolski',
  teryt: '146501_1.0001.12/3',
  polygon: undefined,
  speciesConfig: [...DEFAULT_SPECIES],
  rangesConfig: [...DEFAULT_RANGES],
  pdfPrefs: { ...DEFAULT_PDF_PREFS },
  createdAt: new Date('2026-01-01T10:00:00Z'),
  updatedAt: new Date('2026-01-01T10:00:00Z'),
};

function tree(id: string, lat: number, lng: number, species: string, circumference: number): Tree {
  return {
    id,
    projectId: 'p-1',
    lat,
    lng,
    capturedAt: new Date('2026-01-05T10:00:00Z'),
    species,
    circumference,
  };
}

function parcel(id: string): Parcel {
  return {
    id,
    teryt: id,
    number: id,
    voivodeship: 'mazowieckie',
    county: 'Warszawa',
    commune: 'Śródmieście',
    region: '0001',
    region_name: 'Obręb 0001',
    area_m2: 10000,
    land_use: 'Ls',
    geom: {
      type: 'Polygon',
      coordinates: [
        [
          [21.46, 52.095],
          [21.54, 52.095],
          [21.54, 52.105],
          [21.46, 52.105],
          [21.46, 52.095],
        ],
      ],
    },
    bbox: [21.46, 52.095, 21.54, 52.105],
    centroid: [21.5, 52.1],
    fetched_at: '2026-09-29T03:00:00Z',
    voivodeship_code: '14',
    county_code: '12',
    commune_code: '01',
    datasource: 'uldk',
  };
}

const TREES: Tree[] = [
  tree('t1', 52.1005, 21.49, 'Dąb', 92),
  tree('t2', 52.1001, 21.51, 'Buk', 210),
  tree('t3', 52.0998, 21.52, 'Sosna', 55),
];

describe('PdfMapPreview', () => {
  it('should render the page frame and the parcel polyline', () => {
    render(<PdfMapPreview project={PROJECT} trees={TREES} parcels={[parcel('A')]} />);
    const svg = document.querySelector('[data-testid="pdf-preview-svg"]');
    expect(svg).not.toBeNull();
    expect(svg?.querySelectorAll('polyline').length).toBe(1);
    expect(svg?.querySelectorAll('circle').length).toBeGreaterThanOrEqual(TREES.length + 1);
    expect(screen.getByText('N')).toBeInTheDocument();
  });

  it('should render one marker per tree with a numbered label when the table is shared', () => {
    render(<PdfMapPreview project={PROJECT} trees={TREES} parcels={[parcel('A')]} />);
    const svg = document.querySelector('[data-testid="pdf-preview-svg"]');
    const markers = Array.from(svg?.querySelectorAll('g > circle') ?? []).filter(
      (circle) => circle.getAttribute('fill') !== 'white',
    );
    expect(markers.length).toBe(TREES.length);
    for (const marker of markers) {
      const cx = Number(marker.getAttribute('cx'));
      const r = Number(marker.getAttribute('r'));
      expect(cx - r).toBeGreaterThanOrEqual(12);
      expect(cx + r).toBeLessThanOrEqual(198);
    }
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('should hide numbered labels when the numbered table is off', () => {
    const prefs = { ...DEFAULT_PDF_PREFS, showNumberedTable: false };
    render(<PdfMapPreview project={PROJECT} trees={TREES} parcels={[parcel('A')]} prefs={prefs} />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('should show the empty state without a parcel', () => {
    render(<PdfMapPreview project={PROJECT} trees={TREES} />);
    expect(screen.getByText('Brak działki w projekcie')).toBeInTheDocument();
    const svg = document.querySelector('[data-testid="pdf-preview-svg"]');
    expect(svg?.querySelectorAll('polyline').length).toBe(0);
  });
});
