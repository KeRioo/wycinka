import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Project, Tree } from '@/db/schema';
import { DEFAULT_PDF_PREFS, DEFAULT_RANGES, DEFAULT_SPECIES } from '@/db/schema';
import type { Parcel, ParcelAggregateResponse } from '@/services/api.types';

const aggregateMock = vi.fn();

vi.mock('@/services/api', () => ({
  api: { aggregateParcels: (ids: readonly string[]) => aggregateMock(ids) },
}));

const generatePdfReportMock = vi.fn();
const pdfFileNameMock = vi.fn().mockReturnValue('wycinka-projekt-2026-03-01.pdf');

vi.mock('@/lib/pdf/pdfReport', () => ({
  generatePdfReport: (...args: unknown[]) => generatePdfReportMock(...args),
  pdfFileName: (...args: unknown[]) => pdfFileNameMock(...args),
}));

import PdfExportDialog from '@/components/pdf/PdfExportDialog';
import { db } from '@/db/schema';

const noop = (): void => undefined;

const PROJECT: Project = {
  id: 'p-1',
  name: 'Las Wolski',
  teryt: '146501_1.0001.12/3',
  speciesConfig: [...DEFAULT_SPECIES],
  rangesConfig: [...DEFAULT_RANGES],
  pdfPrefs: { ...DEFAULT_PDF_PREFS },
  createdAt: new Date('2026-01-01T10:00:00Z'),
  updatedAt: new Date('2026-01-01T10:00:00Z'),
};

function tree(partial: Partial<Tree> = {}): Tree {
  return {
    id: partial.id ?? 't1',
    projectId: 'p-1',
    lat: 52.21,
    lng: 21.01,
    capturedAt: new Date('2026-01-05T10:00:00Z'),
    species: partial.species ?? 'Dąb',
    circumference: partial.circumference ?? 60,
    ...partial,
  };
}

describe('PdfExportDialog', () => {
  beforeEach(async () => {
    generatePdfReportMock.mockReset();
    generatePdfReportMock.mockImplementation(() => ({ save: vi.fn() }));
    pdfFileNameMock.mockClear();
    await db.projects.put(PROJECT);
  });

  it('should persist pdf prefs when generating', async () => {
    const user = userEvent.setup();
    render(<PdfExportDialog open project={PROJECT} trees={[tree()]} onClose={noop} />);
    await user.click(screen.getByTestId('pdf-layout-one-per-page'));
    await user.click(screen.getByTestId('pdf-pref-separate'));
    await user.click(screen.getByTestId('pdf-export-generate'));
    await vi.waitFor(async () => {
      const stored = await db.projects.get('p-1');
      expect(stored?.pdfPrefs.layout).toBe('one-per-page');
      expect(stored?.pdfPrefs.tableOnSeparatePage).toBe(true);
    });
  });

  it('should render nothing when closed', () => {
    render(
      <PdfExportDialog open={false} project={PROJECT} trees={[tree()]} onClose={noop} />,
    );
    expect(screen.queryByTestId('pdf-export-dialog')).not.toBeInTheDocument();
  });

  it('should render the layout options and generate button in Polish', () => {
    render(<PdfExportDialog open project={PROJECT} trees={[tree()]} onClose={noop} />);
    expect(screen.getByText('Układ raportu')).toBeInTheDocument();
    expect(screen.getByText(/Klasyczny raport/)).toBeInTheDocument();
    expect(screen.getByText(/Wszystko na jednej stronie/)).toBeInTheDocument();
    expect(screen.getByText(/Sekcje na osobnych stronach/)).toBeInTheDocument();
    expect(screen.getByText('Tabela na osobnej stronie')).toBeInTheDocument();
    expect(screen.getByText('Numerowana lista drzew')).toBeInTheDocument();
    expect(screen.getByText('Automatyczny obrót mapy')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-export-generate')).toHaveTextContent('Generuj PDF');
  });

  it('should generate a PDF with selected layout and persist preferences when enabled', async () => {
    const user = userEvent.setup();
    render(<PdfExportDialog open project={PROJECT} trees={[tree()]} onClose={noop} />);
    await user.click(screen.getByTestId('pdf-layout-one-per-page'));
    await user.click(screen.getByTestId('pdf-pref-separate'));
    await user.click(screen.getByTestId('pdf-export-generate'));
    await vi.waitFor(() => {
      expect(generatePdfReportMock).toHaveBeenCalledTimes(1);
    });
    const input = generatePdfReportMock.mock.calls[0]?.[0] as {
      project: Project;
      trees: Tree[];
    };
    expect(input.project.pdfPrefs.layout).toBe('one-per-page');
    expect(input.project.pdfPrefs.tableOnSeparatePage).toBe(true);
    expect(input.trees).toHaveLength(1);
  });

  it('should disable the generate button when there are no trees', () => {
    render(<PdfExportDialog open project={PROJECT} trees={[]} onClose={noop} />);
    expect(screen.getByTestId('pdf-export-generate')).toBeDisabled();
  });

  it('should show a compass preview with the rotation variant', () => {
    render(<PdfExportDialog open project={PROJECT} trees={[tree()]} onClose={noop} />);
    const compass = screen.getByTestId('compass-svg');
    expect(compass).toBeInTheDocument();
    expect(compass.getAttribute('data-rotation')).toBe('45');
  });

  it('should close when Anuluj is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PdfExportDialog open project={PROJECT} trees={[tree()]} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Anuluj' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PdfExportDialog — parcels/aggregate', () => {
  const AGG: ParcelAggregateResponse = {
    type: 'MultiPolygon',
    coordinates: [
      [[[21.0, 52.2], [21.02, 52.2], [21.02, 52.22], [21.0, 52.2]]],
      [[[21.05, 52.25], [21.06, 52.25], [21.06, 52.26], [21.05, 52.25]]],
    ],
    bbox: [21.0, 52.2, 21.06, 52.26],
    area_m2: 9999,
    parcels: ['A', 'B'],
  };

  function makeParcel(teryt: string): Parcel {
    return {
      id: teryt,
      teryt,
      number: teryt,
      voivodeship: 'mazowieckie',
      county: 'Warszawa',
      commune: 'Śródmieście',
      region: '0001',
      region_name: 'Obręb 0001',
      area_m2: 1000,
      land_use: 'Ls',
      geom: { type: 'Polygon', coordinates: [[[21, 52.2], [21.01, 52.2], [21.01, 52.21], [21, 52.2]]] },
      bbox: [21, 52.2, 21.01, 52.21],
      centroid: [21.005, 52.205],
      fetched_at: '2026-09-29T03:00:00Z',
      voivodeship_code: '14',
      county_code: '12',
      commune_code: '01',
      datasource: 'uldk',
    };
  }

  beforeEach(() => {
    aggregateMock.mockReset();
    aggregateMock.mockResolvedValue(AGG);
  });

  it('should fetch aggregate geometry when multiple parcels', async () => {
    const user = userEvent.setup();
    const parcels = [makeParcel('A'), makeParcel('B')];
    render(<PdfExportDialog open project={PROJECT} trees={[tree()]} parcels={parcels} onClose={noop} />);
    await user.click(screen.getByTestId('pdf-export-generate'));
    await vi.waitFor(() => {
      expect(aggregateMock).toHaveBeenCalledWith(['A', 'B']);
      const input = generatePdfReportMock.mock.calls.at(-1)?.[0] as { aggregate?: unknown; parcels?: unknown };
      expect(input?.aggregate).toEqual(AGG);
      expect(input?.parcels).toEqual(parcels);
    });
  });

  it('should skip aggregate fetch for single parcel and pass parcels', async () => {
    const user = userEvent.setup();
    const parcels = [makeParcel('A')];
    render(<PdfExportDialog open project={PROJECT} trees={[tree()]} parcels={parcels} onClose={noop} />);
    await user.click(screen.getByTestId('pdf-export-generate'));
    await vi.waitFor(() => {
      expect(aggregateMock).not.toHaveBeenCalled();
      const input = generatePdfReportMock.mock.calls.at(-1)?.[0] as { parcels?: unknown };
      expect(input?.parcels).toEqual(parcels);
    });
  });

  it('should continue with per-parcel geometry when aggregate fetch fails', async () => {
    const user = userEvent.setup();
    const parcels = [makeParcel('A'), makeParcel('B')];
    aggregateMock.mockRejectedValue(new Error('network'));
    render(<PdfExportDialog open project={PROJECT} trees={[tree()]} parcels={parcels} onClose={noop} />);
    await user.click(screen.getByTestId('pdf-export-generate'));
    await vi.waitFor(() => {
      const input = generatePdfReportMock.mock.calls.at(-1)?.[0] as { parcels?: unknown; aggregate?: unknown };
      expect(input?.aggregate).toBeUndefined();
      expect(input?.parcels).toEqual(parcels);
    });
  });

  it('should generate without parcels prop (zero regression)', async () => {
    const user = userEvent.setup();
    render(<PdfExportDialog open project={PROJECT} trees={[tree()]} onClose={noop} />);
    await user.click(screen.getByTestId('pdf-export-generate'));
    await vi.waitFor(() => {
      const input = generatePdfReportMock.mock.calls.at(-1)?.[0] as { parcels?: unknown; aggregate?: unknown };
      expect(input?.parcels).toEqual([]);
      expect(input?.aggregate).toBeUndefined();
    });
  });
});
