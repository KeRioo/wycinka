import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, Tree } from '@/db/schema';
import { DEFAULT_PDF_PREFS, DEFAULT_RANGES, DEFAULT_SPECIES } from '@/db/schema';
import type { Parcel } from '@/services/api.types';
import { useAppStore } from '@/stores/appStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTreeStore } from '@/stores/treeStore';
import ReportsModal from '@/components/pdf/ReportsModal';

const aggregateMock = vi.fn();

vi.mock('@/services/api', () => ({
  api: { aggregateParcels: (ids: readonly string[]) => aggregateMock(ids) },
}));

const generatePdfReportMock = vi.fn();
const pdfFileNameMock = vi.fn().mockReturnValue('wycinka-projekt-2026-10-12.pdf');

vi.mock('@/lib/pdf/pdfReport', () => ({
  generatePdfReport: (...args: unknown[]) => generatePdfReportMock(...args),
  pdfFileName: (...args: unknown[]) => pdfFileNameMock(...args),
}));

import { db } from '@/db/schema';

const PROJECT: Project = {
  id: 'p-1',
  name: 'Las Otwock',
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
    lat: 52.2297,
    lng: 21.0122,
    capturedAt: new Date('2026-01-05T10:00:00Z'),
    species: partial.species ?? 'Dąb',
    circumference: partial.circumference ?? 85,
    ...partial,
  };
}

function parcel(teryt: string): Parcel {
  return {
    teryt,
    number: '6509',
    geom: {
      type: 'Polygon',
      coordinates: [
        [
          [21.01, 52.22],
          [21.02, 52.22],
          [21.02, 52.23],
          [21.01, 52.23],
          [21.01, 52.22],
        ],
      ],
    },
    bbox: [21.01, 52.22, 21.02, 52.23],
    area_m2: 12000,
    centroid: [21.015, 52.225],
    voivodeship: 'mazowieckie',
    county: 'warszawski',
    commune: 'Otwock',
    voivodeship_code: '14',
    county_code: '12',
    commune_code: '01',
    datasource: 'test',
  } as unknown as Parcel;
}

function primeStores(options: { trees?: Tree[]; parcels?: Parcel[] } = {}): void {
  useProjectStore.setState({
    activeProjectId: PROJECT.id,
    projectParcels: options.parcels ?? [],
    status: 'loaded',
    projects: [PROJECT],
  });
  useTreeStore.setState({ trees: options.trees ?? [], mode: 'idle', activeProjectId: PROJECT.id });
}

function openReports(): void {
  useAppStore.getState().openAppModal('reports');
}

describe('ReportsModal', () => {
  beforeEach(async () => {
    aggregateMock.mockReset();
    aggregateMock.mockResolvedValue({ parcels: [] } satisfies unknown);
    generatePdfReportMock.mockReset();
    generatePdfReportMock.mockImplementation(() => ({ save: vi.fn() }));
    pdfFileNameMock.mockClear();
    db.delete();
    await db.open();
    await db.projects.put(PROJECT);
    useAppStore.getState().reset();
    primeStores();
  });

  it('should render nothing when app modal is null', () => {
    render(<ReportsModal />);
    expect(screen.queryByTestId('reports-modal')).not.toBeInTheDocument();
  });

  it('should render nothing when settings modal is requested', () => {
    useAppStore.getState().openAppModal('settings');
    render(<ReportsModal />);
    expect(screen.queryByTestId('reports-modal')).not.toBeInTheDocument();
  });

  it('should show print options, preview and generate control when opened via openAppModal', () => {
    openReports();
    render(<ReportsModal />);
    expect(screen.getByTestId('reports-modal')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-preview-svg')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-layout-single')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-layout-one-per-page')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-pref-separate')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-pref-numbered')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-pref-rotate')).toBeInTheDocument();
    expect(screen.getByTestId('config-marker-base')).toBeInTheDocument();
    expect(screen.getByTestId('reports-generate')).toBeInTheDocument();
  });

  it('should contain no species settings duplicated from the settings modal', () => {
    openReports();
    render(<ReportsModal />);
    expect(screen.queryByTestId('species-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
  });

  it('should disable generation when the project has no trees', () => {
    openReports();
    render(<ReportsModal />);
    expect(screen.getByTestId('reports-generate')).toBeDisabled();
  });

  it('should persist edited prefs per project and pass them to pdfReport on generate', async () => {
    const user = userEvent.setup();
    primeStores({ trees: [tree()] });
    openReports();
    render(<ReportsModal />);
    await user.click(screen.getByTestId('pdf-layout-one-per-page'));
    await user.click(screen.getByTestId('pdf-pref-separate'));
    await user.click(screen.getByTestId('reports-generate'));
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
    await waitFor(async () => {
      const stored = await db.projects.get(PROJECT.id);
      expect(stored?.pdfPrefs.layout).toBe('one-per-page');
      expect(stored?.pdfPrefs.tableOnSeparatePage).toBe(true);
    });
  });

  it('should show generation error when pdfReport throws', async () => {
    const user = userEvent.setup();
    generatePdfReportMock.mockImplementation(() => {
      throw new Error('PDF fail');
    });
    primeStores({ trees: [tree()] });
    openReports();
    render(<ReportsModal />);
    await user.click(screen.getByTestId('reports-generate'));
    expect(await screen.findByTestId('reports-error')).toHaveTextContent('PDF fail');
    expect(useAppStore.getState().appModal).toBe('reports');
  });

  it('should show validation error for invalid marker scale instead of generating', async () => {
    const user = userEvent.setup();
    primeStores({ trees: [tree()] });
    openReports();
    render(<ReportsModal />);
    await user.clear(screen.getByTestId('config-marker-max'));
    await user.type(screen.getByTestId('config-marker-max'), '1');
    await user.click(screen.getByTestId('reports-generate'));
    expect(await screen.findByTestId('reports-error')).toHaveTextContent('maxSize');
    expect(generatePdfReportMock).not.toHaveBeenCalled();
  });

  it('should persist edited prefs when closing via reports-close', async () => {
    const user = userEvent.setup();
    primeStores({ trees: [tree()] });
    openReports();
    render(<ReportsModal />);
    await user.click(screen.getByTestId('pdf-pref-numbered'));
    await user.click(screen.getByTestId('reports-close'));
    await waitFor(() => {
      expect(useAppStore.getState().appModal).toBeNull();
    });
    await vi.waitFor(async () => {
      const stored = await db.projects.get(PROJECT.id);
      expect(stored?.pdfPrefs.showNumberedTable).toBe(false);
    });
  });

  it('should reset prefs to defaults via reports-prefs-reset', async () => {
    const user = userEvent.setup();
    const combined: Project = {
      ...PROJECT,
      pdfPrefs: { ...DEFAULT_PDF_PREFS, layout: 'combined' },
    };
    useProjectStore.setState({ projects: [combined] });
    openReports();
    render(<ReportsModal />);
    expect(screen.getByTestId('pdf-layout-combined')).toBeChecked();
    await user.click(screen.getByTestId('reports-prefs-reset'));
    expect(screen.getByTestId('pdf-layout-single')).toBeChecked();
  });

  it('should fetch aggregate when the project has multiple parcels', async () => {
    const user = userEvent.setup();
    primeStores({ trees: [tree()], parcels: [parcel('141001_1.0001.6501'), parcel('141001_1.0001.6502')] });
    openReports();
    render(<ReportsModal />);
    await user.click(screen.getByTestId('reports-generate'));
    await vi.waitFor(() => {
      expect(aggregateMock).toHaveBeenCalledTimes(1);
    });
  });

  it('should skip aggregate for a single parcel', async () => {
    const user = userEvent.setup();
    primeStores({ trees: [tree()], parcels: [parcel('141001_1.0001.6501')] });
    openReports();
    render(<ReportsModal />);
    await user.click(screen.getByTestId('reports-generate'));
    await vi.waitFor(() => {
      expect(generatePdfReportMock).toHaveBeenCalledTimes(1);
    });
    expect(aggregateMock).not.toHaveBeenCalled();
  });
});
