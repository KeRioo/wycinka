import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';
import PdfPrefsEditor from '@/components/settings/PdfPrefsEditor';
import RangesEditor from '@/components/settings/RangesEditor';
import SpeciesEditor from '@/components/settings/SpeciesEditor';
import BackupPanel from '@/components/settings/BackupPanel';
import { Card, CardContent } from '@/components/ui';
import { useProjectStore } from '@/stores/projectStore';
import type { Project } from '@/db/schema';

export default function SettingsPage(): JSX.Element {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const status = useProjectStore((s) => s.status);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const savePdfPrefs = useProjectStore((s) => s.savePdfPrefs);
  const saveSpeciesConfig = useProjectStore((s) => s.saveSpeciesConfig);
  const saveRangesConfig = useProjectStore((s) => s.saveRangesConfig);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const activeProject: Project | null =
    activeProjectId !== null ? (projects.find((p) => p.id === activeProjectId) ?? null) : null;
  const loading = status === 'loading' && projects.length === 0;

  if (loading) {
    return (
      <div className="h-full overflow-auto bg-stone-50 p-4 sm:p-6">
        <p data-testid="settings-loading" className="text-sm text-stone-500">
          Ładowanie ustawień…
        </p>
      </div>
    );
  }

  if (activeProject === null) {
    return (
      <div className="h-full overflow-auto bg-stone-50 p-4 sm:p-6">
        <Card className="mx-auto max-w-xl">
          <CardContent className="space-y-3 p-6 text-center text-sm text-stone-700">
            <p>Brak aktywnego projektu.</p>
            <p>
              Ustawienia dotyczą konfiguracji konkretnego projektu.{' '}
              <Link to="/projects" className="text-forest-700 underline hover:text-forest-900">
                Wybierz lub utwórz projekt
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-stone-50 p-4 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="flex items-center gap-2">
          <SettingsIcon aria-hidden="true" className="h-6 w-6 text-forest-700" />
          <div>
            <h1 className="text-2xl font-semibold text-forest-900">Ustawienia projektu</h1>
            <p className="text-sm text-stone-600">Projekt: {activeProject.name}</p>
          </div>
        </header>

        <SpeciesEditor
          initial={activeProject.speciesConfig}
          onSave={(species) => saveSpeciesConfig(activeProject.id, species)}
        />
        <RangesEditor
          initial={activeProject.rangesConfig}
          onSave={(ranges) => saveRangesConfig(activeProject.id, ranges)}
        />
        <PdfPrefsEditor
          initial={activeProject.pdfPrefs}
          onSave={(prefs) => savePdfPrefs(activeProject.id, prefs)}
        />
        <BackupPanel />

        <p className="pt-2 text-sm text-stone-500">
          <Link to="/map" className="text-forest-700 underline hover:text-forest-900">
            Wróć do mapy
          </Link>
        </p>
      </div>
    </div>
  );
}
