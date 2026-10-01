import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FolderPlus, Map as MapIcon, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useProjectStore } from '@/stores/projectStore';
import type { Project } from '@/db/schema';

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('pl-PL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

interface ProjectRowProps {
  project: Project;
  onSelect: () => void;
  onDelete: () => void;
}

function ProjectRow({ project, onSelect, onDelete }: ProjectRowProps): JSX.Element {
  return (
    <Card data-testid="project-card" className="transition-colors hover:border-forest-300">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span>{project.name}</span>
          <button
            type="button"
            aria-label={`Usuń projekt ${project.name}`}
            data-testid="project-delete"
            onClick={onDelete}
            className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm text-stone-600">
          {project.teryt !== undefined && <p>TERYT: {project.teryt}</p>}
          <p>Utworzony: {formatDate(project.createdAt)}</p>
          <Button
            size="sm"
            variant="primary"
            data-testid="project-open"
            onClick={onSelect}
          >
            <MapIcon aria-hidden="true" className="mr-1 h-4 w-4" />
            Otwórz
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProjectsPage(): JSX.Element {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const status = useProjectStore((s) => s.status);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const setActive = useProjectStore((s) => s.setActive);
  const createAndActivate = useProjectStore((s) => s.createAndActivate);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const navigate = useNavigate();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [creating, setCreating] = useState<boolean>(false);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleCreate = async (): Promise<void> => {
    setCreating(true);
    try {
      const created = await createAndActivate(`Projekt ${String(projects.length + 1)}`);
      navigate('/map');
      return created;
    } finally {
      setCreating(false);
    }
  };

  const handleSelect = (id: string): void => {
    setActive(id);
    navigate('/map');
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (confirmDeleteId === null) {
      return;
    }
    await deleteProject(confirmDeleteId);
    setConfirmDeleteId(null);
  };

  return (
    <div className="h-full overflow-auto bg-stone-50 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-semibold text-forest-900">Projekty</h1>
            <p className="text-sm text-stone-600">
              Zarządzaj projektami inwentaryzacji drzew. Każdy projekt ma własną listę drzew.
            </p>
          </div>
          <Button
            data-testid="new-project"
            onClick={() => {
              void handleCreate();
            }}
            disabled={creating}
          >
            <FolderPlus aria-hidden="true" className="mr-2 h-5 w-5" />
            + Nowy projekt
          </Button>
        </header>

        {status === 'loading' && (
          <p data-testid="projects-loading" className="text-sm text-stone-500">
            Ładowanie projektów…
          </p>
        )}

        {projects.length === 0 && status !== 'loading' && (
          <Card>
            <CardContent className="text-center text-sm text-stone-600">
              Brak projektów. Utwórz pierwszy projekt, aby zacząć dodawać drzewa.
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <div key={project.id} className={project.id === activeProjectId ? 'ring-2 ring-forest-500 rounded-lg' : ''}>
              <ProjectRow
                project={project}
                onSelect={() => {
                  handleSelect(project.id);
                }}
                onDelete={() => {
                  setConfirmDeleteId(project.id);
                }}
              />
            </div>
          ))}
        </div>

        <p className="pt-2 text-sm text-stone-500">
          <Link to="/map" className="text-forest-700 underline hover:text-forest-900">
            Wróć do mapy
          </Link>
        </p>
      </div>

      {confirmDeleteId !== null && (
        <div
          role="dialog"
          aria-label="Potwierdź usunięcie"
          data-testid="confirm-delete"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
        >
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-base">Usunąć projekt?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-stone-600">
                Tej operacji nie można cofnąć. Wszystkie drzewa w projekcie zostaną usunięte.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="confirm-delete-cancel"
                  onClick={() => {
                    setConfirmDeleteId(null);
                  }}
                >
                  Anuluj
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  data-testid="confirm-delete-ok"
                  onClick={() => {
                    void handleConfirmDelete();
                  }}
                >
                  Usuń
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
