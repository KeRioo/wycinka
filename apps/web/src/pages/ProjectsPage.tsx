import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FolderPlus, Map as MapIcon, Pencil, Trash2, X } from 'lucide-react';
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
  onRename: () => void;
}

function ProjectRow({ project, onSelect, onDelete, onRename }: ProjectRowProps): JSX.Element {
  return (
    <Card data-testid="project-card" className="transition-colors hover:border-forest-300">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span>{project.name}</span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`Edytuj nazwę projektu ${project.name}`}
              data-testid="project-rename"
              onClick={onRename}
              className="flex h-11 w-11 items-center justify-center rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-forest-700"
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Usuń projekt ${project.name}`}
              data-testid="project-delete"
              onClick={onDelete}
              className="flex h-11 w-11 items-center justify-center rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </button>
          </span>
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
  const projectParcels = useProjectStore((s) => s.projectParcels);
  const loadProjectParcels = useProjectStore((s) => s.loadProjectParcels);
  const removeParcelFromProject = useProjectStore((s) => s.removeParcelFromProject);
  const renameProject = useProjectStore((s) => s.renameProject);
  const navigate = useNavigate();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [creating, setCreating] = useState<boolean>(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState<string>('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [createName, setCreateName] = useState<string>('Mój pierwszy projekt');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadProjectParcels(activeProjectId);
  }, [activeProjectId, loadProjectParcels]);

  const handleCreate = async (): Promise<void> => {
    const name = createName.trim();
    if (name.length < 1 || name.length > 100) {
      setCreateError('Nazwa projektu musi mieć od 1 do 100 znaków');
      return;
    }
    setCreating(true);
    try {
      await createAndActivate(name);
      navigate('/map');
    } finally {
      setCreating(false);
    }
  };

  const handleRenameOpen = (project: Project): void => {
    setRenameId(project.id);
    setRenameName(project.name);
    setRenameError(null);
  };

  const handleRenameSave = async (): Promise<void> => {
    if (renameId === null) {
      return;
    }
    const ok = await renameProject(renameId, renameName);
    if (!ok) {
      setRenameError(
        useProjectStore.getState().toast ?? 'Nazwa projektu musi mieć od 1 do 100 znaków',
      );
      return;
    }
    setRenameId(null);
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
              setCreateName('Mój pierwszy projekt');
              setCreateError(null);
              setCreateOpen(true);
            }}
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

        {projects.length > 0 && activeProjectId !== null && (
          <Card data-testid="active-project-panel">
            <CardHeader>
              <CardTitle className="text-base">
                Aktywny projekt ·{' '}
                {projects.find((p) => p.id === activeProjectId)?.name ?? '—'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p data-testid="project-parcel-count" className="text-sm text-stone-600">
                Działki: {String(projectParcels.length)}
              </p>
              {projectParcels.length > 0 && (
                <div data-testid="project-parcel-chips" className="mt-2 flex flex-wrap gap-2">
                  {projectParcels.map((parcel) => (
                    <span
                      key={parcel.teryt}
                      data-testid={`parcel-chip-${parcel.teryt}`}
                      className="inline-flex items-center gap-1 rounded-full border border-forest-200 bg-forest-50 px-3 py-1 text-xs font-medium text-forest-800"
                    >
                      {parcel.teryt}
                      <button
                        type="button"
                        aria-label={`Usuń działkę ${parcel.teryt} z projektu`}
                        data-testid={`parcel-chip-remove-${parcel.teryt}`}
                        onClick={() => {
                          void removeParcelFromProject(parcel.teryt);
                        }}
                        className="rounded-full p-0.5 text-forest-600 hover:bg-forest-100 hover:text-red-600"
                      >
                        <X aria-hidden="true" className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
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
                onRename={() => {
                  handleRenameOpen(project);
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

      {renameId !== null && (
        <div
          role="dialog"
          aria-label="Edytuj nazwę projektu"
          data-testid="rename-dialog"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
        >
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-base">Edytuj nazwę projektu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                data-testid="rename-input"
                type="text"
                value={renameName}
                maxLength={100}
                onChange={(e) => {
                  setRenameName(e.target.value);
                  setRenameError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void handleRenameSave();
                  }
                }}
                className="h-11 w-full rounded-md border border-stone-300 px-3 text-sm focus:border-forest-500 focus:outline-none"
                aria-label="Nazwa projektu"
              />
              {renameError !== null && (
                <p data-testid="rename-error" role="alert" className="text-sm text-red-700">
                  {renameError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="rename-cancel"
                  onClick={() => {
                    setRenameId(null);
                  }}
                >
                  Anuluj
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  data-testid="rename-save"
                  onClick={() => {
                    void handleRenameSave();
                  }}
                >
                  Zapisz
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {createOpen && (
        <div
          role="dialog"
          aria-label="Nowy projekt"
          data-testid="create-dialog"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
        >
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-base">Nowy projekt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block space-y-1">
                <span className="text-sm text-stone-600">Nazwa</span>
                <input
                  data-testid="create-name-input"
                  type="text"
                  value={createName}
                  maxLength={100}
                  onChange={(e) => {
                    setCreateName(e.target.value);
                    setCreateError(null);
                  }}
                  className="h-11 w-full rounded-md border border-stone-300 px-3 text-sm focus:border-forest-500 focus:outline-none"
                />
              </label>
              {createError !== null && (
                <p data-testid="create-error" role="alert" className="text-sm text-red-700">
                  {createError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="create-cancel"
                  onClick={() => {
                    setCreateOpen(false);
                  }}
                >
                  Anuluj
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  data-testid="create-save"
                  disabled={creating}
                  onClick={() => {
                    void handleCreate();
                  }}
                >
                  Utwórz
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
