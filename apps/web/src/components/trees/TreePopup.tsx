import { PencilLine, Trash2, X } from 'lucide-react';
import type { Tree } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { formatLatLng, getSpeciesColor } from '@/lib/geo';
import { formatDate } from '@/lib/dates';

interface TreePopupProps {
  tree: Tree;
  onEdit: () => void;
  onDelete: () => void;
  onClose?: () => void;
}

export default function TreePopup({
  tree,
  onEdit,
  onDelete,
  onClose,
}: TreePopupProps): JSX.Element {
  return (
    <div data-testid="tree-popup" className="min-w-[240px] space-y-2 text-sm text-forest-900">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-forest-700">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: getSpeciesColor(tree.species) }}
            />
            {tree.species}
          </h3>
          <p className="text-xs text-stone-500">Obwód: {tree.circumference} cm</p>
          <p className="text-xs text-stone-500">Data: {formatDate(tree.capturedAt)}</p>
          {tree.notes !== undefined && tree.notes !== '' && (
            <p className="text-xs text-stone-500">Notatka: {tree.notes}</p>
          )}
          <p className="font-mono text-xs text-stone-500">
            Położenie: {formatLatLng(tree.lat, tree.lng)}
          </p>
        </div>
        {onClose !== undefined && (
          <button
            type="button"
            aria-label="Zamknij"
            data-testid="tree-popup-close"
            onClick={onClose}
            className="rounded p-1 text-stone-400 hover:bg-stone-100"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </header>
      <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-2">
        <Button size="sm" variant="secondary" data-testid="tree-popup-edit" onClick={onEdit}>
          <PencilLine aria-hidden="true" className="h-4 w-4" />
          Edytuj
        </Button>
        <Button size="sm" variant="danger" data-testid="tree-popup-delete" onClick={onDelete}>
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          Usuń
        </Button>
      </div>
    </div>
  );
}
