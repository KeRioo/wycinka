import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ProjectsPage from '@/pages/ProjectsPage';
import { db, addParcelToProjectDb } from '@/db/schema';
import { useProjectStore } from '@/stores/projectStore';
import type { Parcel } from '@/services/api.types';
import { MOCK_PARCEL_FOUND } from '@/test/mocks/api-responses';

function makeParcel(teryt: string): Parcel {
  const found = MOCK_PARCEL_FOUND;
  if (!found.found) {
    throw new Error('Mock parcel missing');
  }
  return { ...found.parcel, id: teryt, teryt };
}

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('ProjectsPage', () => {
  beforeEach(async () => {
    db.delete();
    await db.open();
    useProjectStore.getState().clear();
    mockNavigate.mockReset();
  });

  afterEach(() => {
    if (db.isOpen()) {
      db.close();
    }
  });

  it('should render title and new project button', () => {
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Projekty');
    expect(screen.getByTestId('new-project')).toHaveTextContent(/\+ Nowy projekt/);
  });

  it('should show empty state when no projects', () => {
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    return waitFor(() => {
      expect(screen.getByText(/Brak projektów/)).toBeInTheDocument();
    });
  });

  it('should list existing projects', async () => {
    await useProjectStore.getState().createAndActivate('Leśny A');
    await useProjectStore.getState().createAndActivate('Leśny B');
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Leśny A')).toBeInTheDocument();
      expect(screen.getByText('Leśny B')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('project-card')).toHaveLength(2);
  });

  it('should create new project and navigate to /map', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('new-project')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('new-project'));
    await waitFor(() => {
      expect(screen.getByTestId('create-dialog')).toBeInTheDocument();
    });
    expect(screen.getByTestId('create-name-input')).toHaveValue('Mój pierwszy projekt');
    await user.click(screen.getByTestId('create-save'));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/map');
    });
    expect(useProjectStore.getState().projects.length).toBeGreaterThan(0);
  });

  it('should select project and navigate to /map', async () => {
    const user = userEvent.setup();
    await useProjectStore.getState().createAndActivate('Leśny A');
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Leśny A')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('project-open'));
    expect(mockNavigate).toHaveBeenCalledWith('/map');
    expect(useProjectStore.getState().activeProjectId).not.toBeNull();
  });

  it('should show confirm dialog when delete clicked', async () => {
    const user = userEvent.setup();
    await useProjectStore.getState().createAndActivate('Do usunięcia');
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Do usunięcia')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('project-delete'));
    expect(screen.getByTestId('confirm-delete')).toBeInTheDocument();
  });

  it('should cancel deletion when Anuluj clicked', async () => {
    const user = userEvent.setup();
    await useProjectStore.getState().createAndActivate('X');
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('X')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('project-delete'));
    await user.click(screen.getByTestId('confirm-delete-cancel'));
    expect(screen.queryByTestId('confirm-delete')).not.toBeInTheDocument();
    expect(useProjectStore.getState().projects).toHaveLength(1);
  });

  it('should delete project when Usuń clicked', async () => {
    const user = userEvent.setup();
    await useProjectStore.getState().createAndActivate('X');
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('X')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('project-delete'));
    await user.click(screen.getByTestId('confirm-delete-ok'));
    await waitFor(() => {
      expect(useProjectStore.getState().projects).toHaveLength(0);
    });
  });

  it('should show parcel chips with count for active project', async () => {
    const project = await useProjectStore.getState().createAndActivate('Las');
    await addParcelToProjectDb(project.id, makeParcel('141201_1.0001.6501'));
    await addParcelToProjectDb(project.id, makeParcel('141201_1.0001.6502'));
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('active-project-panel')).toBeInTheDocument();
    });
    expect(screen.getByTestId('project-parcel-count')).toHaveTextContent('Działki: 2');
    expect(screen.getByTestId('parcel-chip-141201_1.0001.6501')).toBeInTheDocument();
    expect(screen.getByTestId('parcel-chip-141201_1.0001.6502')).toBeInTheDocument();
  });

  it('should remove parcel chip on remove click', async () => {
    const user = userEvent.setup();
    const project = await useProjectStore.getState().createAndActivate('Las');
    await addParcelToProjectDb(project.id, makeParcel('141201_1.0001.6501'));
    await addParcelToProjectDb(project.id, makeParcel('141201_1.0001.6502'));
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('parcel-chip-141201_1.0001.6501')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('parcel-chip-remove-141201_1.0001.6501'));
    await waitFor(() => {
      expect(screen.queryByTestId('parcel-chip-141201_1.0001.6501')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('project-parcel-count')).toHaveTextContent('Działki: 1');
  });

  it('should create project with custom name from dialog', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('new-project')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('new-project'));
    await user.clear(screen.getByTestId('create-name-input'));
    await user.type(screen.getByTestId('create-name-input'), 'Mój las 2026');
    await user.click(screen.getByTestId('create-save'));
    await waitFor(() => {
      expect(useProjectStore.getState().projects[0]?.name).toBe('Mój las 2026');
    });
    expect(mockNavigate).toHaveBeenCalledWith('/map');
  });

  it('should show create error for empty name', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('new-project')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('new-project'));
    await user.clear(screen.getByTestId('create-name-input'));
    await user.click(screen.getByTestId('create-save'));
    await waitFor(() => {
      expect(screen.getByTestId('create-error')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should cancel rename dialog and keep original name', async () => {
    const user = userEvent.setup();
    const project = await useProjectStore.getState().createAndActivate('Stara nazwa');
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Stara nazwa')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('project-rename'));
    await user.clear(screen.getByTestId('rename-input'));
    await user.type(screen.getByTestId('rename-input'), 'Nowa nazwa');
    await user.click(screen.getByTestId('rename-cancel'));
    expect(screen.queryByTestId('rename-dialog')).not.toBeInTheDocument();
    const stored = await useProjectStore.getState().projects.find((p) => p.id === project.id);
    expect(stored?.name).toBe('Stara nazwa');
  });

  it('should persist renamed project on save', async () => {
    const user = userEvent.setup();
    const project = await useProjectStore.getState().createAndActivate('Stara nazwa');
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Stara nazwa')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('project-rename'));
    await user.clear(screen.getByTestId('rename-input'));
    await user.type(screen.getByTestId('rename-input'), 'Nowa nazwa');
    await user.click(screen.getByTestId('rename-save'));
    await waitFor(() => {
      expect(screen.queryByTestId('rename-dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Nowa nazwa')).toBeInTheDocument();
    const stored = await useProjectStore.getState().projects.find((p) => p.id === project.id);
    expect(stored?.name).toBe('Nowa nazwa');
  });

  it('should show rename error for invalid name and not persist', async () => {
    const user = userEvent.setup();
    const project = await useProjectStore.getState().createAndActivate('Stara nazwa');
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('Stara nazwa')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('project-rename'));
    await user.clear(screen.getByTestId('rename-input'));
    await user.click(screen.getByTestId('rename-save'));
    await waitFor(() => {
      expect(screen.getByTestId('rename-error')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('rename-dialog')).toBeInTheDocument();
    const stored = await useProjectStore.getState().projects.find((p) => p.id === project.id);
    expect(stored?.name).toBe('Stara nazwa');
  });

  it('should show empty message when active project has no parcels', async () => {
    await useProjectStore.getState().createAndActivate('Puste las');
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('active-project-panel')).toBeInTheDocument();
    });
    expect(screen.getByTestId('project-parcel-count')).toHaveTextContent('Działki: 0');
    expect(screen.queryByTestId('project-parcel-chips')).not.toBeInTheDocument();
  });
});
