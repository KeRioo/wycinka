import { AnimatePresence, motion } from 'framer-motion';
import { PencilLine, Trash2, X } from 'lucide-react';
import type { Tree } from '@/db/schema';
import { getSpeciesColor } from '@/lib/geo';
import { formatDate } from '@/lib/dates';

interface TreeListPanelProps {
  open: boolean;
  onClose: () => void;
  trees: Tree[];
  onSelectTree: (id: string) => void;
  onDeleteTree: (id: string) => void;
  onEditTree: (id: string) => void;
}

export default function TreeListPanel({
  open,
  onClose,
  trees,
  onSelectTree,
  onDeleteTree,
  onEditTree,
}: TreeListPanelProps): JSX.Element {
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="tree-list-panel"
          data-testid="tree-list-panel"
          role="dialog"
          aria-label="Lista drzew"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
          className="pointer-events-auto absolute inset-y-0 right-0 z-30 flex w-80 max-w-[90vw] flex-col border-l border-stone-200 bg-white shadow-2xl"
        >
          <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-forest-900">Drzewa</h2>
              <span
                aria-label={`Liczba drzew: ${String(trees.length)}`}
                className="rounded-full bg-forest-100 px-2 py-0.5 text-xs font-medium text-forest-800"
              >
                {trees.length}
              </span>
            </div>
            <button
              type="button"
              aria-label="Zamknij listę drzew"
              data-testid="tree-list-close"
              onClick={onClose}
              className="rounded p-1 text-stone-500 hover:bg-stone-100"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </header>

          {trees.length === 0 ? (
            <div className="space-y-1 p-4 text-sm text-stone-600">
              <p data-testid="tree-list-empty">Brak drzew w tym projekcie.</p>
              <p className="text-xs text-stone-400">
                Użyj przycisku „Dodaj drzewo”, aby dodać pierwsze drzewo.
              </p>
            </div>
          ) : (
            <ul className="flex-1 space-y-1 overflow-y-auto p-2">
              {trees.map((tree) => (
                <li
                  key={tree.id}
                  data-testid="tree-list-item"
                  className="flex items-center gap-1 rounded-lg p-2 hover:bg-stone-50"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTree(tree.id);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-500"
                  >
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: getSpeciesColor(tree.species) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-forest-900">
                        {tree.species}
                      </span>
                      <span className="block text-xs text-stone-500">
                        Obwód: {tree.circumference} cm · {formatDate(tree.capturedAt)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Edytuj drzewo"
                    data-testid={`tree-list-edit-${tree.id}`}
                    onClick={() => {
                      onEditTree(tree.id);
                    }}
                    className="rounded p-2 text-stone-500 hover:bg-stone-100 hover:text-forest-700"
                  >
                    <PencilLine aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Usuń drzewo"
                    data-testid={`tree-list-delete-${tree.id}`}
                    onClick={() => {
                      onDeleteTree(tree.id);
                    }}
                    className="rounded p-2 text-stone-500 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
