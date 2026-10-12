import { AnimatePresence, motion } from 'framer-motion';
import { Settings as SettingsIcon, X } from 'lucide-react';
import { Button } from '@/components/ui';
import RangesEditor from './RangesEditor';
import SpeciesEditor from './SpeciesEditor';
import { useAppStore } from '@/stores/appStore';
import { useProjectStore } from '@/stores/projectStore';

export default function SettingsModal(): JSX.Element {
  const appModal = useAppStore((s) => s.appModal);
  const closeAppModal = useAppStore((s) => s.closeAppModal);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projects = useProjectStore((s) => s.projects);
  const saveSpeciesConfig = useProjectStore((s) => s.saveSpeciesConfig);
  const saveRangesConfig = useProjectStore((s) => s.saveRangesConfig);

  const open = appModal === 'settings';
  const project =
    activeProjectId !== null ? (projects.find((p) => p.id === activeProjectId) ?? null) : null;

  return (
    <AnimatePresence>
      {open && (
        <div
          data-testid="settings-modal"
          className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/50 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            role="dialog"
            aria-modal="true"
            aria-label="Ustawienia projektu"
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-stone-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <SettingsIcon aria-hidden="true" className="h-5 w-5 text-forest-700" />
                <h2 className="text-lg font-semibold text-forest-900">Ustawienia projektu</h2>
              </div>
              <button
                type="button"
                aria-label="Zamknij ustawienia"
                data-testid="settings-close"
                onClick={closeAppModal}
                className="flex h-11 w-11 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {project === null ? (
                <p className="text-sm text-stone-600" data-testid="settings-no-project">
                  Brak aktywnego projektu — ustawienia dotyczą konfiguracji konkretnego projektu.
                </p>
              ) : (
                <>
                  <p className="text-sm text-stone-600">Projekt: {project.name}</p>
                  <SpeciesEditor
                    initial={project.speciesConfig}
                    onSave={(species) => saveSpeciesConfig(project.id, species)}
                  />
                  <RangesEditor
                    initial={project.rangesConfig}
                    onSave={(ranges) => saveRangesConfig(project.id, ranges)}
                  />
                </>
              )}
            </div>

            <footer className="flex shrink-0 items-center justify-end border-t border-stone-200 px-4 py-3">
              <Button size="md" variant="primary" data-testid="settings-done" onClick={closeAppModal}>
                Gotowe
              </Button>
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
