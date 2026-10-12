import { useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui';

interface GpsTroubleshootModalProps {
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
}

const TROUBLESHOOT_STEPS = [
  'Włącz lokalizację (GPS) na urządzeniu.',
  'Zezwól tej stronie na dostęp do lokalizacji — ikona kłódki lub „Aa” w pasku adresu przeglądarki.',
  'Wyjdź pod otwarte niebo — sygnał GPS nie przenika przez dachy budynków i gęsty las.',
  'Sprawdź, czy przeglądarka nie blokuje uprawnień dla tej witryny (np. tryb prywatny, ustawienia witryn).',
] as const;

const LOCATION_HELP_URL = 'https://support.google.com/chrome/answer/142065?hl=pl';

export default function GpsTroubleshootModal({
  open,
  onClose,
  onRetry,
}: GpsTroubleshootModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handleKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const handleRetry = (): void => {
    onRetry();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rozwiązywanie problemów z GPS"
        data-testid="gps-troubleshoot-modal"
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <h2 className="text-lg font-semibold text-forest-900">Brak sygnału GPS</h2>
          <p className="mt-1 text-sm text-stone-600">
            Aplikacja nie może ustalić Twojej pozycji. Sprawdź poniższe kroki i spróbuj ponownie.
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-stone-700">
            {TROUBLESHOOT_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <a
            href={LOCATION_HELP_URL}
            target="_blank"
            rel="noreferrer"
            data-testid="gps-troubleshoot-link"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-forest-700 underline hover:text-forest-900"
          >
            Pełna instrukcja włączania lokalizacji
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-stone-100 p-4">
          <Button
            variant="secondary"
            data-testid="gps-troubleshoot-close"
            onClick={onClose}
          >
            Zamknij
          </Button>
          <Button data-testid="gps-troubleshoot-retry" onClick={handleRetry}>
            Spróbuj ponownie
          </Button>
        </div>
      </div>
    </div>
  );
}
