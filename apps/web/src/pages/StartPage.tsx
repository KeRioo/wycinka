import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FolderPlus, Inbox, Smartphone, TreePine } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui';import BackupPanel from '@/components/settings/BackupPanel';
import { useProjectStore, type RecentProjectRow } from '@/stores/projectStore';
import {
  formatParcelsLine,
  formatRelativeTime,
  formatTreeCount,
} from '@/lib/format';

const RECENT_LIMIT = 3;
const DEFAULT_PROJECT_NAME = 'Mój projekt';
const NAME_ERROR = 'Nazwa projektu musi mieć od 1 do 100 znaków';

function RecentRow({ row, onSelect }: { row: RecentProjectRow; onSelect: () => void }): JSX.Element {
  const { project, stats } = row;
  return (
    <Card data-testid="recent-row" className="p-0 transition-colors hover:border-forest-400">
      <button
        type="button"
        className="block w-full rounded-lg p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500"
        onClick={onSelect}
      >
        <p className="truncate text-base font-semibold text-forest-900">
          {project.name}
          <span className="sr-only"> — otwórz projekt</span>
        </p>
        <p className="mt-0.5 truncate text-sm text-stone-600">
          {formatParcelsLine(
            stats.parcelNumbers.map((number) => ({ number })),
            stats.locality,
          )}
        </p>
        <p className="mt-0.5 text-sm text-stone-500">
          {formatTreeCount(stats.treeCount)} • Edytowano {formatRelativeTime(project.updatedAt)}
        </p>
      </button>
    </Card>
  );
}

export default function StartPage(): JSX.Element {
  const navigate = useNavigate();
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const setActive = useProjectStore((s) => s.setActive);
  const createAndActivate = useProjectStore((s) => s.createAndActivate);
  const touchProject = useProjectStore((s) => s.touchProject);
  const getRecentProjectsWithStats = useProjectStore((s) => s.getRecentProjectsWithStats);

  const [recent, setRecent] = useState<RecentProjectRow[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [createName, setCreateName] = useState(DEFAULT_PROJECT_NAME);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadRecent = async (): Promise<void> => {
      const rows = await getRecentProjectsWithStats(RECENT_LIMIT);
      if (!cancelled) {
        setRecent(rows);
      }
    };
    void loadRecent();
    return () => {
      cancelled = true;
    };
  }, [getRecentProjectsWithStats]);

  const openProject = async (id: string): Promise<void> => {
    await loadProjects();
    setActive(id);
    await touchProject(id);
    navigate('/app');
  };

  const handleCreate = async (): Promise<void> => {
    const name = createName.trim();
    if (name.length < 1 || name.length > 100) {
      setCreateError(NAME_ERROR);
      return;
    }
    setCreating(true);
    try {
      await createAndActivate(name);
      navigate('/app');
    } finally {
      setCreating(false);
    }
  };

  const openCreate = (): void => {
    setCreateName(DEFAULT_PROJECT_NAME);
    setCreateError(null);
    setCreateOpen(true);
  };

  return (
    <div className="flex h-full w-full items-start justify-center overflow-auto bg-gradient-to-b from-forest-900 via-forest-950 to-stone-950 p-4 sm:items-center sm:p-6">
      <motion.section
        data-testid="start-panel"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-stone-50 shadow-2xl"
      >
        <header className="bg-gradient-to-br from-forest-700 to-forest-950 px-6 py-8 text-center text-white">
          <TreePine aria-hidden="true" className="mx-auto h-12 w-12 text-forest-300" />
          <h1 className="mt-2 text-2xl font-bold">Wycinka Drzew</h1>
          <p className="mt-1 text-sm text-forest-100">
            Inwentaryzacja drzew na działkach leśnych
          </p>
        </header>

        <CardContent className="space-y-5 p-5">
          <Button
            data-testid="start-new-project"
            className="h-12 w-full text-base"
            onClick={openCreate}
          >
            <FolderPlus aria-hidden="true" className="mr-2 h-5 w-5" />
            Nowy projekt
          </Button>

          <section aria-label="Ostatnie projekty" className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
              Ostatnie projekty
            </h2>
            {recent === null && (
              <p data-testid="start-recent-loading" className="py-2 text-sm text-stone-500">
                Ładowanie projektów…
              </p>
            )}
            {recent !== null && recent.length === 0 && (
              <p data-testid="start-recent-empty" className="flex items-center gap-2 py-2 text-sm text-stone-500">
                <Inbox aria-hidden="true" className="h-4 w-4" />
                Brak ostatnich projektów. Utwórz pierwszy projekt, aby zacząć.
              </p>
            )}
            {recent !== null && recent.length > 0 && (
              <div data-testid="start-recent-list" className="space-y-2">
                {recent.map((row) => (
                  <RecentRow
                    key={row.project.id}
                    row={row}
                    onSelect={() => {
                      void openProject(row.project.id);
                    }}
                  />
                ))}
              </div>
            )}
            <Link
              to="/projects"
              data-testid="start-all-projects"
              className="inline-flex h-11 items-center text-sm font-medium text-forest-700 underline hover:text-forest-900"
            >
              Wszystkie projekty
            </Link>
          </section>

          <button
            type="button"
            data-testid="start-import-link"
            onClick={() => {
              setImportOpen(true);
            }}
            className="inline-flex h-11 items-center text-sm text-stone-500 underline hover:text-stone-700"
          >
            <Smartphone aria-hidden="true" className="mr-2 h-4 w-4" />
            Importuj z innego urządzenia
          </button>
        </CardContent>
      </motion.section>

      {createOpen && (
        <div
          role="dialog"
          aria-label="Nowy projekt"
          data-testid="create-dialog"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
        >
          <Card className="w-full max-w-sm">
            <CardContent className="space-y-3 p-5">
              <h2 className="text-base font-semibold text-forest-900">Nowy projekt</h2>
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void handleCreate();
                    }
                  }}
                  className="h-11 w-full rounded-md border border-stone-300 px-3 text-sm focus:border-forest-500 focus:outline-none"
                  aria-label="Nazwa projektu"
                  autoFocus
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

      {importOpen && (
        <div
          role="dialog"
          aria-label="Importuj z innego urządzenia"
          data-testid="import-modal"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
        >
          <Card className="flex max-h-[85vh] w-full max-w-md flex-col">
            <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              <h2 className="text-base font-semibold text-forest-900">
                Przywróć kopię z innego urządzenia
              </h2>
              <ol className="list-inside list-decimal space-y-1 text-sm text-stone-600">
                <li>Na starym urządzeniu użyj „Eksportuj kopię (JSON)".</li>
                <li>Przenieś plik kopii na to urządzenie (np. Bluetooth, chmura).</li>
                <li>Wybierz plik poniżej i kliknij „Importuj".</li>
              </ol>
              <p className="text-sm text-stone-500">
                Import możesz wykonać w trybie nadpisania lub scalania — tryb wybierasz poniżej.
              </p>
              <BackupPanel />
            </CardContent>
            <div className="shrink-0 border-t border-stone-200 p-4 pb-4">
              <Button
                variant="secondary"
                size="sm"
                data-testid="import-close"
                onClick={() => {
                  setImportOpen(false);
                }}
              >
                Zamknij
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
