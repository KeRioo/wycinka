import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { cn } from '@/lib/utils';

export type AppOverlayKind = 'modal' | 'panel';

export const PANEL_MOBILE_HEIGHT_CLASS = 'h-[50dvh] min-h-[300px]';

const MODAL_BACKDROP_CLASS =
  'pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-stone-900/40 p-4';
const MODAL_CARD_CLASS =
  'flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl';
const PANEL_MOBILE_CLASS =
  'pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-2xl border-t border-stone-200 bg-white shadow-2xl';
const PANEL_DESKTOP_CLASS =
  'pointer-events-auto absolute inset-y-0 right-0 z-30 flex flex-col overflow-hidden border-l border-stone-200 bg-white shadow-2xl';

const PANEL_TRANSITION = { type: 'tween' as const, duration: 0.2, ease: 'easeOut' as const };

function ModalCloseButton({
  closeLabel,
  onClose,
}: {
  closeLabel: string;
  onClose: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-label={closeLabel}
      data-testid="modal-close"
      onClick={onClose}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500"
    >
      <X aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}

interface AppModalShellProps {
  kind: AppOverlayKind;
  open: boolean;
  testId: string;
  ariaLabel: string;
  title?: string;
  onClose?: () => void;
  closeLabel?: string;
  maxWidthClass?: string;
  desktopWidthClass?: string;
  children: ReactNode;
}

export default function AppModalShell({
  kind,
  open,
  testId,
  ariaLabel,
  title,
  onClose,
  closeLabel = 'Zamknij',
  maxWidthClass = 'max-w-xl',
  desktopWidthClass = 'w-80 max-w-[90vw]',
  children,
}: AppModalShellProps): JSX.Element {
  const isMobileViewport = useMobileViewport();

  if (kind === 'modal') {
    const hasHeader = title !== undefined || onClose !== undefined;
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            data-testid={testId}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={MODAL_BACKDROP_CLASS}
          >
            <div className={cn(MODAL_CARD_CLASS, maxWidthClass)}>
              {hasHeader && (
                <header className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
                  <h2 className="text-lg font-semibold text-forest-900">{title}</h2>
                  {onClose !== undefined && <ModalCloseButton closeLabel={closeLabel} onClose={onClose} />}
                </header>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {open &&
        (isMobileViewport ? (
          <motion.section
            key="panel-mobile"
            data-testid={testId}
            data-split-panel="true"
            role="dialog"
            aria-label={ariaLabel}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={PANEL_TRANSITION}
            className={cn(PANEL_MOBILE_CLASS, PANEL_MOBILE_HEIGHT_CLASS)}
          >
            {children}
          </motion.section>
        ) : (
          <motion.section
            key="panel-desktop"
            data-testid={testId}
            data-split-panel="false"
            role="dialog"
            aria-label={ariaLabel}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={PANEL_TRANSITION}
            className={cn(PANEL_DESKTOP_CLASS, desktopWidthClass)}
          >
            {children}
          </motion.section>
        ))}
    </AnimatePresence>
  );
}
