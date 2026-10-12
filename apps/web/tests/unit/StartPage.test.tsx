import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import StartPage from '@/pages/StartPage';
import { addParcelToProjectDb, addTree, createProject, db } from '@/db/schema';
import { useProjectStore } from '@/stores/projectStore';

function renderStart(): void {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<StartPage />} />
        <Route path="/app" element={<div data-testid="app-marker" />} />
        <Route path="/projects" element={<div data-testid="projects-marker" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StartPage (launcher)', () => {
  beforeEach(async () => {
    db.delete();
    await db.open();
    useProjectStore.getState().clear();
  });

  it('should render the launcher panel with all three options', async () => {
    renderStart();
    expect(await screen.findByTestId('start-new-project')).toBeInTheDocument();
    expect(screen.getByTestId('start-all-projects')).toBeInTheDocument();
    expect(screen.getByTestId('start-import-link')).toBeInTheDocument();
  });

  it('should show empty state when there are no projects', async () => {
    renderStart();
    const list = await screen.findByTestId('start-recent-empty');
    expect(list).toHaveTextContent('Brak ostatnich projektów');
  });

  it('should render recent project rows with name, parcels, trees and relative time', async () => {
    const project = await createProject({ name: 'Las Otwock' });
    await addParcelRow(project.id, '141201_1.0001.6509', '251/1', 'Otwock');
    await addParcelRow(project.id, '141201_1.0001.6510', '251/2', 'Otwock');
    await addParcelRow(project.id, '141201_1.0001.6511', '251/3', 'Otwock');
    await addTree({
      projectId: project.id,
      lat: 52.23,
      lng: 21.01,
      species: 'Dąb',
      circumference: 85,
    });
    renderStart();
    const row = await screen.findByTestId('recent-row');
    expect(within(row).getByText('Las Otwock')).toBeInTheDocument();
    expect(within(row).getByText('Działka 251/1, 251/2 … • Otwock')).toBeInTheDocument();
    expect(within(row).getByText('1 drzewo • Edytowano teraz')).toBeInTheDocument();
  });

  it('should show placeholder line when a project has no parcels', async () => {
    await createProject({ name: 'Pusty projekt' });
    renderStart();
    const row = await screen.findByTestId('recent-row');
    expect(within(row).getByText('Brak działek')).toBeInTheDocument();
    expect(within(row).getByText('0 drzew • Edytowano teraz')).toBeInTheDocument();
  });

  it('should open the create dialog with the default name', async () => {
    const user = userEvent.setup();
    renderStart();
    await user.click(await screen.findByTestId('start-new-project'));
    const dialog = screen.getByTestId('create-dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId('create-name-input')).toHaveValue('Mój projekt');
  });

  it('should create a project and navigate to the app', async () => {
    const user = userEvent.setup();
    renderStart();
    await user.click(await screen.findByTestId('start-new-project'));
    await user.clear(screen.getByTestId('create-name-input'));
    await user.type(screen.getByTestId('create-name-input'), 'Las Otwock');
    await user.click(screen.getByTestId('create-save'));
    expect(await screen.findByTestId('app-marker')).toBeInTheDocument();
    await waitFor(() => {
      expect(useProjectStore.getState().activeProjectId).not.toBeNull();
      expect(useProjectStore.getState().getActive()?.name).toBe('Las Otwock');
    });
  });

  it('should keep the default name and create it when untouched', async () => {
    const user = userEvent.setup();
    renderStart();
    await user.click(await screen.findByTestId('start-new-project'));
    await user.click(screen.getByTestId('create-save'));
    await screen.findByTestId('app-marker');
    expect(useProjectStore.getState().getActive()?.name).toBe('Mój projekt');
  });

  it('should show validation error for an empty name and stay on start', async () => {
    const user = userEvent.setup();
    renderStart();
    await user.click(await screen.findByTestId('start-new-project'));
    await user.clear(screen.getByTestId('create-name-input'));
    await user.click(screen.getByTestId('create-save'));
    expect(screen.getByTestId('create-error')).toHaveTextContent('od 1 do 100 znaków');
    expect(screen.queryByTestId('app-marker')).not.toBeInTheDocument();
  });

  it('should cancel the create dialog', async () => {
    const user = userEvent.setup();
    renderStart();
    await user.click(await screen.findByTestId('start-new-project'));
    await user.click(screen.getByTestId('create-cancel'));
    expect(screen.queryByTestId('create-dialog')).not.toBeInTheDocument();
  });

  it('should open a recent project and navigate to the app', async () => {
    const user = userEvent.setup();
    const project = await createProject({ name: 'Las Otwock' });
    renderStart();
    const row = await screen.findByTestId('recent-row');
    await user.click(within(row).getByRole('button'));
    expect(await screen.findByTestId('app-marker')).toBeInTheDocument();
    useProjectStore.getState().setActive(project.id);
    await waitFor(() => {
      const touched = useProjectStore.getState().projects.find((p) => p.id === project.id);
      expect(useProjectStore.getState().activeProjectId).toBe(project.id);
      expect(touched).not.toBeUndefined();
    });
  });

  it('should navigate to the projects page from the launcher link', async () => {
    const user = userEvent.setup();
    renderStart();
    await user.click(await screen.findByTestId('start-all-projects'));
    expect(await screen.findByTestId('projects-marker')).toBeInTheDocument();
  });

  it('should open and close the import-from-device modal', async () => {
    const user = userEvent.setup();
    renderStart();
    await user.click(await screen.findByTestId('start-import-link'));
    const modal = screen.getByTestId('import-modal');
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId('backup-panel')).toBeInTheDocument();
    await user.click(screen.getByTestId('import-close'));
    expect(screen.queryByTestId('import-modal')).not.toBeInTheDocument();
  });
});

async function addParcelRow(
  projectId: string,
  teryt: string,
  number: string,
  commune: string,
): Promise<void> {
  await addParcelToProjectDb(projectId, {
    id: teryt,
    teryt,
    number,
    voivodeship: 'mazowieckie',
    county: 'Miasto Otwock',
    commune,
    region: '0001',
    region_name: 'Otwock',
    area_m2: 1234.56,
    land_use: 'Ls',
    voivodeship_code: '14',
    county_code: '12',
    commune_code: '01',
    datasource: 'uldk',
    geom: {
      type: 'Polygon',
      coordinates: [[[21.006, 52.231], [21.007, 52.231], [21.007, 52.232], [21.006, 52.231]]],
    },
    bbox: [21.006, 52.231, 21.007, 52.232],
    centroid: [21.0065, 52.2315],
    fetched_at: '2026-09-29T03:00:00Z',
  });
}
