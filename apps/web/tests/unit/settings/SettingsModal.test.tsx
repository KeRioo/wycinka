import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import SettingsModal from '@/components/settings/SettingsModal';
import { DEFAULT_RANGES, DEFAULT_SPECIES, db } from '@/db/schema';
import type { Project } from '@/db/schema';
import { useAppStore } from '@/stores/appStore';
import { useProjectStore } from '@/stores/projectStore';

const PROJECT: Project = {
  id: 'p-1',
  name: 'Las Otwock',
  speciesConfig: [...DEFAULT_SPECIES],
  rangesConfig: [...DEFAULT_RANGES],
  pdfPrefs: {
    layout: 'single',
    markerColorBy: 'species',
    markerSizeBy: 'circumference',
    markerScale: { baseSize: 3, perCm: 0.06, maxSize: 18 },
    showNumberedTable: true,
    tableOnSeparatePage: false,
    autoRotate: true,
  },
  createdAt: new Date('2026-01-01T10:00:00Z'),
  updatedAt: new Date('2026-01-01T10:00:00Z'),
};

function primeStores(project: Project | null): void {
  useProjectStore.setState({
    activeProjectId: project?.id ?? null,
    projects: project !== null ? [project] : [],
    status: 'loaded',
    projectParcels: [],
  });
}

describe('SettingsModal', () => {
  beforeEach(async () => {
    db.delete();
    await db.open();
    await db.projects.put(PROJECT);
    useAppStore.getState().reset();
    primeStores(PROJECT);
  });

  it('should render nothing when app modal is null', () => {
    render(<SettingsModal />);
    expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
  });

  it('should render nothing when reports modal is requested', () => {
    useAppStore.getState().openAppModal('reports');
    render(<SettingsModal />);
    expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
  });

  it('should open with species and ranges editors via openAppModal', () => {
    useAppStore.getState().openAppModal('settings');
    render(<SettingsModal />);
    expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
    expect(screen.getByTestId('species-editor')).toBeInTheDocument();
    expect(screen.getByTestId('ranges-editor')).toBeInTheDocument();
    expect(screen.getByText('Projekt: Las Otwock')).toBeInTheDocument();
  });

  it('should contain no print options in the settings modal', () => {
    useAppStore.getState().openAppModal('settings');
    render(<SettingsModal />);
    expect(screen.queryByTestId('pdf-prefs-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('config-layout-single')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pdf-preview-svg')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pdf-export-generate')).not.toBeInTheDocument();
  });

  it('should close via settings-close button', async () => {
    const user = userEvent.setup();
    useAppStore.getState().openAppModal('settings');
    render(<SettingsModal />);
    await user.click(screen.getByTestId('settings-close'));
    await waitFor(() => {
      expect(useAppStore.getState().appModal).toBeNull();
    });
  });

  it('should close via settings-done button', async () => {
    const user = userEvent.setup();
    useAppStore.getState().openAppModal('settings');
    render(<SettingsModal />);
    await user.click(screen.getByTestId('settings-done'));
    await waitFor(() => {
      expect(useAppStore.getState().appModal).toBeNull();
    });
  });

  it('should persist species edits to the active project in Dexie', async () => {
    const user = userEvent.setup();
    useAppStore.getState().openAppModal('settings');
    render(<SettingsModal />);
    await user.click(screen.getByLabelText('Usuń gatunek Dąb'));
    await user.click(screen.getByTestId('species-save'));
    await expect(await screen.findByTestId('species-saved')).toBeInTheDocument();
    await waitFor(async () => {
      const stored = await db.projects.get(PROJECT.id);
      expect(stored?.speciesConfig.some((s) => s.name === 'Dąb')).toBe(false);
    });
  });

  it('should persist ranges edits to the active project in Dexie', async () => {
    const user = userEvent.setup();
    useAppStore.getState().openAppModal('settings');
    render(<SettingsModal />);
    await user.click(screen.getByLabelText('Przedział 1 od'));
    await user.clear(screen.getByLabelText('Przedział 1 od'));
    await user.type(screen.getByLabelText('Przedział 1 od'), '10');
    await user.click(screen.getByTestId('ranges-save'));
    await expect(await screen.findByTestId('ranges-saved')).toBeInTheDocument();
    await waitFor(async () => {
      const stored = await db.projects.get(PROJECT.id);
      expect(stored?.rangesConfig[0]?.from).toBe(10);
    });
  });

  it('should keep config scoped to the edited project', async () => {
    const other: Project = { ...PROJECT, id: 'p-2', name: 'Las Kabacki' };
    await db.projects.put(other);
    const trimmed = DEFAULT_SPECIES.filter((s) => s.name !== 'Dąb');
    const user = userEvent.setup();
    useAppStore.getState().openAppModal('settings');
    render(<SettingsModal />);
    await user.click(screen.getByLabelText('Usuń gatunek Dąb'));
    await user.click(screen.getByTestId('species-save'));
    await expect(await screen.findByTestId('species-saved')).toBeInTheDocument();
    await waitFor(async () => {
      const [active, untouched] = await Promise.all([
        db.projects.get(PROJECT.id),
        db.projects.get(other.id),
      ]);
      expect(active?.speciesConfig.length).toBe(trimmed.length);
      expect(untouched?.speciesConfig.length).toBe(DEFAULT_SPECIES.length);
    });
  });

  it('should show no-project hint when there is no active project', () => {
    primeStores(null);
    useAppStore.getState().openAppModal('settings');
    render(<SettingsModal />);
    expect(screen.getByTestId('settings-no-project')).toBeInTheDocument();
    expect(screen.queryByTestId('species-editor')).not.toBeInTheDocument();
  });
});
