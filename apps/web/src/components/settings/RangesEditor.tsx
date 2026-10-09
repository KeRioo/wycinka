import { useState } from 'react';
import { ArrowDown, ArrowUp, ListOrdered, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { DEFAULT_RANGES } from '@/db/schema';
import type { RangeConfig } from '@/db/schema';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

export interface RangesEditorProps {
  initial: readonly RangeConfig[];
  onSave: (ranges: RangeConfig[]) => Promise<void>;
}

export default function RangesEditor({ initial, onSave }: RangesEditorProps): JSX.Element {
  const [ranges, setRanges] = useState<RangeConfig[]>(initial.map((r) => ({ ...r })));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateAt = (index: number, patch: Partial<RangeConfig>): void => {
    setRanges((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setSaved(false);
  };

  const move = (index: number, direction: -1 | 1): void => {
    setRanges((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      const item = next[index];
      next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
    setSaved(false);
  };

  const remove = (index: number): void => {
    setRanges((current) => current.filter((_, i) => i !== index));
    setSaved(false);
  };

  const add = (): void => {
    setRanges((current) => [...current, { from: 0, to: 100, label: '0–100 cm' }]);
    setSaved(false);
  };

  const resetDefaults = (): void => {
    setRanges(DEFAULT_RANGES.map((r) => ({ ...r })));
    setSaved(false);
  };

  const handleSave = async (): Promise<void> => {
    for (const range of ranges) {
      if (range.label.trim().length === 0) {
        setError('Każdy przedział musi mieć etykietę.');
        return;
      }
      if (
        !Number.isFinite(range.from) ||
        (range.to !== Number.POSITIVE_INFINITY && !Number.isFinite(range.to))
      ) {
        setError('Podaj poprawne wartości liczbowe przedziałów.');
        return;
      }
      if (range.from >= range.to) {
        setError(`Nieprawidłowy przedział: „${range.label}” — od < do.`);
        return;
      }
    }
    for (let i = 1; i < ranges.length; i++) {
      const prev = ranges[i - 1];
      const current = ranges[i];
      if (prev.to > current.from) {
        setError('Przedziały muszą być rozłączne i rosnące.');
        return;
      }
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(ranges.map((r) => ({ from: r.from, to: r.to, label: r.label.trim() })));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="ranges-editor">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListOrdered aria-hidden="true" className="h-5 w-5 text-forest-700" />
          Przedziały obwodów
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-stone-600">
          Przedziały używane w tabeli PDF (gatunek × obwód). Zastępują domyślne od 50 cm.
        </p>
        <ul className="space-y-2">
          {ranges.map((item, index) => (
            <li key={index} className="flex items-center gap-1.5">
              <input
                type="number"
                aria-label={`Przedział ${String(index + 1)} od`}
                value={Number.isFinite(item.from) ? item.from : ''}
                onChange={(e) => {
                  updateAt(index, { from: Number(e.target.value) });
                }}
                className="w-20 rounded-md border border-stone-300 px-2 py-2 text-sm focus:border-forest-500 focus:outline-none"
              />
              <button
                type="button"
                aria-label={`Otwarty koniec przedziału ${String(index + 1)}`}
                aria-pressed={item.to === Number.POSITIVE_INFINITY}
                data-testid={`ranges-open-${String(index)}`}
                onClick={() => {
                  updateAt(index, {
                    to: item.to === Number.POSITIVE_INFINITY ? 100 : Number.POSITIVE_INFINITY,
                  });
                }}
                className={
                  item.to === Number.POSITIVE_INFINITY
                    ? 'rounded border border-forest-500 bg-forest-50 px-2 py-2 text-sm text-forest-800'
                    : 'rounded border border-stone-300 px-2 py-2 text-sm text-stone-500'
                }
              >
                ∞
              </button>
              <input
                type="text"
                aria-label={`Etykieta przedziału ${String(index + 1)}`}
                value={item.label}
                onChange={(e) => {
                  updateAt(index, { label: e.target.value });
                }}
                className="min-w-0 flex-1 rounded-md border border-stone-300 px-2 py-2 text-sm focus:border-forest-500 focus:outline-none"
              />
              <button
                type="button"
                aria-label={`Przenieś przedział ${String(index + 1)} w górę`}
                disabled={index === 0}
                onClick={() => {
                  move(index, -1);
                }}
                className="rounded p-1.5 text-stone-500 hover:bg-stone-100 disabled:text-stone-300"
              >
                <ArrowUp aria-hidden="true" className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Przenieś przedział ${String(index + 1)} w dół`}
                disabled={index === ranges.length - 1}
                onClick={() => {
                  move(index, 1);
                }}
                className="rounded p-1.5 text-stone-500 hover:bg-stone-100 disabled:text-stone-300"
              >
                <ArrowDown aria-hidden="true" className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Usuń przedział ${String(index + 1)}`}
                onClick={() => {
                  remove(index);
                }}
                className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" data-testid="ranges-add" onClick={add}>
            <Plus aria-hidden="true" className="mr-1 h-4 w-4" />
            Dodaj przedział
          </Button>
          <Button size="sm" variant="ghost" data-testid="ranges-reset" onClick={resetDefaults}>
            <RotateCcw aria-hidden="true" className="mr-1 h-4 w-4" />
            Przywróć domyślne (§8.5)
          </Button>
        </div>

        {error !== null && (
          <p className="text-sm text-red-600" role="alert" data-testid="ranges-error">
            {error}
          </p>
        )}
        {saved && (
          <p className="text-sm text-forest-700" role="status" data-testid="ranges-saved">
            Zapisano przedziały.
          </p>
        )}

        <Button
          variant="primary"
          size="sm"
          data-testid="ranges-save"
          disabled={saving}
          onClick={() => {
            void handleSave();
          }}
        >
          {saving ? 'Zapisywanie…' : 'Zapisz przedziały'}
        </Button>
      </CardContent>
    </Card>
  );
}
