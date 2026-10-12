import { useEffect } from 'react';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion';
import { LocateFixed } from 'lucide-react';
import ArrowPad from './ArrowPad';
import GpsIndicator from './GpsIndicator';
import TreeForm from './TreeForm';
import { Button } from '@/components/ui/button';
import { PANEL_MOBILE_HEIGHT_CLASS } from '@/components/layout/AppModalShell';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { useMapStore } from '@/stores/mapStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTreeStore, draftPosition, type TreeDraft } from '@/stores/treeStore';
import type { GeolocationPosition } from '@/hooks/useGeolocation';

const DRAG_CLOSE_OFFSET_Y = 100;
const DRAG_CLOSE_VELOCITY_Y = 500;

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
  const isMobile = useMobileViewport();
  const dragControls = useDragControls();

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
    void useTreeStore
      .getState()
      .save(activeProjectId)
      .catch(() => {
        // błąd obsłużony w store; panel zostaje otwarty
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
    useProjectStore.getState().setToast('Pozycja odświeżona z GPS');
  };

  const handleNudge = (dx: number, dy: number): void => {
    useTreeStore.getState().nudge(dx, dy);
  };

  const handleCancel = (): void => {
    useTreeStore.getState().cancel();
  };

  const handleFocusPending = (): void => {
    const pos = draftPosition(pending);
    useMapStore.getState().requestFocus({ lat: pos.lat, lng: pos.lng });
  };

  const handleDragEnd = (_event: unknown, info: PanInfo): void => {
    const shouldClose =
      info.offset.y > DRAG_CLOSE_OFFSET_Y || info.velocity.y > DRAG_CLOSE_VELOCITY_Y;
    if (shouldClose) {
      handleCancel();
    }
  };

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
        drag={isMobile ? 'y' : false}
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={handleDragEnd}
        className={`pointer-events-auto absolute inset-x-0 bottom-0 z-30 ${PANEL_MOBILE_HEIGHT_CLASS} max-h-[85vh] flex flex-col overflow-hidden rounded-t-2xl border-t border-stone-200 bg-white shadow-2xl sm:h-auto sm:min-h-0 sm:max-h-[calc(100%-1.5rem)] sm:rounded-2xl sm:border`}
        data-mobile-sheet={isMobile ? 'true' : 'false'}
        style={
          isMobile
            ? undefined
            : { top: '0.75rem', left: 'auto', right: '0.75rem', width: 'min(22rem, 90vw)' }
        }
      >
        <button
          type="button"
          data-testid="add-tree-drag-handle"
          aria-label="Zamknij panel drzewa"
          onPointerDown={(event) => {
            if (!isMobile) {
              return;
            }
            event.preventDefault();
            dragControls.start(event);
          }}
          onClick={() => {
            if (!isMobile) {
              return;
            }
            handleCancel();
          }}
          className="flex h-8 w-full shrink-0 items-center justify-center sm:hidden"
        >
          <span aria-hidden="true" className="h-1.5 w-12 rounded-full bg-stone-300" />
        </button>

        <div
          data-testid="add-tree-header"
          className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200 px-3 py-2"
        >
          <h2 className="min-w-0 truncate text-base font-semibold text-forest-900">
            {mode === 'editing' ? 'Edytuj drzewo' : 'Dodaj drzewo'}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="secondary"
              data-testid="panel-cancel"
              onClick={handleCancel}
              className="h-11 px-3 text-sm"
            >
              Anuluj
            </Button>
            <Button
              type="button"
              variant="primary"
              data-testid="panel-save"
              onClick={handleSave}
              disabled={!formValid}
              className="h-11 px-3 text-sm"
            >
              {mode === 'editing' ? 'Zapisz zmiany' : 'Zapisz'}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3" data-testid="add-tree-body">
          <GpsIndicator
            position={gpsPosition}
            loading={gpsLoading}
            error={gpsError}
            onRefresh={onRefreshGps}
          />

          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs text-stone-500">
              Pozycja:{' '}
              <span data-testid="pending-position" className="font-mono">
                {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
              </span>
            </p>
            <button
              type="button"
              data-testid="focus-pending"
              aria-label="Przesuń mapę do pinezki"
              onClick={handleFocusPending}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-forest-300 bg-forest-50 text-forest-800 hover:bg-forest-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500"
            >
              <LocateFixed aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          <ArrowPad
            onNudge={handleNudge}
            {...(gpsPosition === null ? {} : { onUseGps: handleUseGps })}
            dx={pending.manualOffset.dx}
            dy={pending.manualOffset.dy}
          />

          <TreeForm />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function isFormValid(pending: TreeDraft): boolean {
  return pending.species.length > 0 && pending.circumference > 0 && pending.circumference <= 1000;
}
