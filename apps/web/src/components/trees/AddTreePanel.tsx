import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import ArrowPad from './ArrowPad';
import GpsIndicator from './GpsIndicator';
import TreeForm from './TreeForm';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/stores/projectStore';
import { useTreeStore, draftPosition, type TreeDraft } from '@/stores/treeStore';
import type { GeolocationPosition } from '@/hooks/useGeolocation';

interface AddTreePanelProps {
  gpsPosition: GeolocationPosition | null;
  gpsLoading: boolean;
  gpsError: string | null;
  onRefreshGps: () => void;
}

export default function AddTreePanel({
  gpsPosition,
  gpsLoading,
  gpsError,
  onRefreshGps,
}: AddTreePanelProps): JSX.Element | null {
  const mode = useTreeStore((s) => s.mode);
  const pending = useTreeStore((s) => s.pending);

  useEffect(() => {
    const shouldSeedFromGps =
      mode === 'placing' && pending !== null && pending.lat === 0 && pending.lng === 0;
    if (!shouldSeedFromGps || gpsPosition === null) {
      return;
    }
    useTreeStore.getState().useGps({
      lat: gpsPosition.lat,
      lng: gpsPosition.lng,
      accuracy: gpsPosition.accuracy,
    });
  }, [mode, pending, gpsPosition]);

  if (mode === 'idle' || pending === null) {
    return null;
  }

  const handleSave = (): void => {
    const activeProjectId = useProjectStore.getState().activeProjectId;
    if (activeProjectId === null) {
      return;
    }
    void useTreeStore.getState().save(activeProjectId).catch(() => {
      // errors surfaced via store / no UI surfacing needed for MVP
    });
  };

  const handleUseGps = (): void => {
    if (gpsPosition === null) {
      return;
    }
    useTreeStore.getState().useGps({
      lat: gpsPosition.lat,
      lng: gpsPosition.lng,
      accuracy: gpsPosition.accuracy,
    });
  };

  const handleNudge = (dx: number, dy: number): void => {
    useTreeStore.getState().nudge(dx, dy);
  };

  const handleCancel = (): void => {
    useTreeStore.getState().cancel();
  };

  const offset = pending.manualOffset;
  const formValid = isFormValid(pending);
  const pos = draftPosition(pending);

  return (
    <AnimatePresence>
      <motion.div
        key="add-tree-panel"
        data-testid="add-tree-panel"
        role="dialog"
        aria-label="Dodaj drzewo"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-stone-200 bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-forest-900">
            {mode === 'editing' ? 'Edytuj drzewo' : 'Dodaj drzewo'}
          </h2>
          <button
            type="button"
            aria-label="Anuluj dodawanie drzewa"
            data-testid="panel-close"
            onClick={handleCancel}
            className="rounded p-1 text-stone-500 hover:bg-stone-100"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <GpsIndicator
            position={gpsPosition}
            loading={gpsLoading}
            error={gpsError}
            onRefresh={onRefreshGps}
          />

          <div className="text-xs text-stone-500">
            <span>Pozycja: </span>
            <span data-testid="pending-position" className="font-mono">
              {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
            </span>
          </div>

          <ArrowPad
            onNudge={handleNudge}
            {...(gpsPosition !== null ? { onUseGps: handleUseGps } : {})}
            dx={offset.dx}
            dy={offset.dy}
          />

          <TreeForm />

          <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-3">
            <Button type="button" variant="secondary" data-testid="panel-cancel" onClick={handleCancel}>
              Anuluj
            </Button>
            <Button
              type="button"
              variant="primary"
              data-testid="panel-save"
              onClick={handleSave}
              disabled={!formValid}
            >
              {mode === 'editing' ? 'Zapisz zmiany' : 'Zapisz'}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function isFormValid(pending: TreeDraft): boolean {
  return pending.species.length > 0 && pending.circumference > 0 && pending.circumference <= 1000;
}
