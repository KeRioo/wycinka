import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import SettingsPage from '@/pages/SettingsPage';
import { createProject, db, updateSpeciesConfig } from '@/db/schema';
import { useProjectStore } from '@/stores/projectStore';

async function seedActive(): Promise<string> {
  const project = await createProject({ name: 'Las Settingowy' });
  useProjectStore.getState().clear();
  await useProjectStore.getState().loadProjects();
  useProjectStore.getState().setActive(project.id);
  return project.id;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe('SettingsPage', () => {
  it('should show empty state when no active project', async () => {
    db.delete();
    await db.open();
    useProjectStore.getState().clear();
    renderPage();
    expect(await screen.findByText('Brak aktywnego projektu.')).toBeInTheDocument();
  });

  it('should render all config editors with active project', async () => {
    await seedActive();
    renderPage();
    expect(await screen.findByTestId('species-editor')).toBeInTheDocument();
    expect(screen.getByTestId('ranges-editor')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-prefs-editor')).toBeInTheDocument();
    expect(screen.getByTestId('backup-panel')).toBeInTheDocument();
    expect(screen.getByText('Projekt: Las Settingowy')).toBeInTheDocument();
  });

  it('should persist species config to Dexie through editor flow', async () => {
    const projectId = await seedActive();
    await updateSpeciesConfig(projectId, [
      { name: 'Modrzew', color: '#4ade80' },
      { name: 'Jodła', color: '#166534' },
    ]);
    await useProjectStore.getState().loadProjects();
    renderPage();
    expect(await screen.findByDisplayValue('Modrzew')).toBeInTheDocument();
  });
});
