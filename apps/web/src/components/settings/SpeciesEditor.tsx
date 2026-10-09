import { useState } from 'react';
import { ArrowDown, ArrowUp, Palette, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { DEFAULT_SPECIES } from '@/db/schema';
import type { SpeciesConfig } from '@/db/schema';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

export interface SpeciesEditorProps {
  initial: readonly SpeciesConfig[];
  onSave: (species: SpeciesConfig[]) => Promise<void>;
}

export default function SpeciesEditor({ initial, onSave }: SpeciesEditorProps): JSX.Element {
  const [species, setSpecies] = useState<SpeciesConfig[]>(initial.map((s) => ({ ...s })));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateAt = (index: number, patch: Partial<SpeciesConfig>): void => {
    setSpecies((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    setSaved(false);
  };

  const move = (index: number, direction: -1 | 1): void => {
    setSpecies((current) => {
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
    setSpecies((current) => current.filter((_, i) => i !== index));
    setSaved(false);
  };

  const add = (): void => {
    setSpecies((current) => [...current, { name: '', color: '#15803d' }]);
    setSaved(false);
  };

  const resetDefaults = (): void => {
    setSpecies(DEFAULT_SPECIES.map((s) => ({ ...s })));
    setSaved(false);
  };

  const handleSave = async (): Promise<void> => {
    const names = species.map((s) => s.name.trim());
    if (names.some((n) => n.length === 0)) {
      setError('Każdy gatunek musi mieć nazwę.');
      return;
    }
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    if (duplicates.length > 0) {
      setError(`Duplikat gatunku: ${duplicates[0]}`);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(species.map((s) => ({ name: s.name.trim(), color: s.color })));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="species-editor">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette aria-hidden="true" className="h-5 w-5 text-forest-700" />
          Gatunki drzew
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-stone-600">
          Lista używana w formularzu drzewa. Kolejność = kolejność na liście wyboru.
        </p>
        <ul className="space-y-2">
          {species.map((item, index) => (
            <li key={index} className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`Kolor gatunku ${item.name || '(nowy)'}`}
                value={item.color}
                onChange={(e) => {
                  updateAt(index, { color: e.target.value });
                }}
                className="h-9 w-9 cursor-pointer rounded border border-stone-300 p-0.5"
              />
              <input
                type="text"
                aria-label={`Nazwa gatunku ${String(index + 1)}`}
                value={item.name}
                placeholder="Gatunek"
                onChange={(e) => {
                  updateAt(index, { name: e.target.value });
                }}
                className="flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-forest-500 focus:outline-none"
              />
              <button
                type="button"
                aria-label={`Przenieś ${item.name || '(nowy)'} w górę`}
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
                aria-label={`Przenieś ${item.name || '(nowy)'} w dół`}
                disabled={index === species.length - 1}
                onClick={() => {
                  move(index, 1);
                }}
                className="rounded p-1.5 text-stone-500 hover:bg-stone-100 disabled:text-stone-300"
              >
                <ArrowDown aria-hidden="true" className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Usuń gatunek ${item.name || '(nowy)'}`}
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
          <Button size="sm" variant="secondary" data-testid="species-add" onClick={add}>
            <Plus aria-hidden="true" className="mr-1 h-4 w-4" />
            Dodaj gatunek
          </Button>
          <Button size="sm" variant="ghost" data-testid="species-reset" onClick={resetDefaults}>
            <RotateCcw aria-hidden="true" className="mr-1 h-4 w-4" />
            Przywróć domyślne
          </Button>
        </div>

        {error !== null && (
          <p className="text-sm text-red-600" role="alert" data-testid="species-error">
            {error}
          </p>
        )}
        {saved && (
          <p className="text-sm text-forest-700" role="status" data-testid="species-saved">
            Zapisano gatunki.
          </p>
        )}

        <Button
          variant="primary"
          size="sm"
          data-testid="species-save"
          disabled={saving}
          onClick={() => {
            void handleSave();
          }}
        >
          {saving ? 'Zapisywanie…' : 'Zapisz gatunki'}
        </Button>
      </CardContent>
    </Card>
  );
}
