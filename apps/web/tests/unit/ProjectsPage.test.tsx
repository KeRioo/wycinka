import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ProjectsPage from '@/pages/ProjectsPage';
import { db } from '@/db/schema';
import { useProjectStore } from '@/stores/projectStore';

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
});
