import { useState } from 'react';
import { FileText, RotateCcw } from 'lucide-react';
import { DEFAULT_PDF_PREFS } from '@/db/schema';
import type { PdfPrefs } from '@/db/schema';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

export interface PdfPrefsEditorProps {
  initial: PdfPrefs;
  onSave: (prefs: PdfPrefs) => Promise<void>;
}

const LAYOUT_OPTIONS: readonly { value: PdfPrefs['layout']; label: string }[] = [
  { value: 'single', label: 'Klasyczny raport' },
  { value: 'combined', label: 'Wszystko na jednej stronie' },
  { value: 'one-per-page', label: 'Sekcje na osobnych stronach' },
];

export default function PdfPrefsEditor({ initial, onSave }: PdfPrefsEditorProps): JSX.Element {
  const [prefs, setPrefs] = useState<PdfPrefs>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggle = (key: 'tableOnSeparatePage' | 'showNumberedTable' | 'autoRotate'): void => {
    setPrefs((current) => ({ ...current, [key]: !current[key] }));
    setSaved(false);
  };

  const setScaleValue = (key: keyof PdfPrefs['markerScale'], value: string): void => {
    const num = Number(value);
    setPrefs((current) => ({
      ...current,
      markerScale: { ...current.markerScale, [key]: Number.isFinite(num) ? num : 0 },
    }));
    setSaved(false);
  };

  const resetDefaults = (): void => {
    setPrefs({ ...DEFAULT_PDF_PREFS });
    setSaved(false);
  };

  const handleSave = async (): Promise<void> => {
    if (
      prefs.markerScale.baseSize < 0 ||
      prefs.markerScale.perCm < 0 ||
      prefs.markerScale.maxSize <= 0
    ) {
      setError('Skala markerów: rozmiary nieujemne, maxSize > 0.');
      return;
    }
    if (prefs.markerScale.maxSize < prefs.markerScale.baseSize) {
      setError('maxSize nie może być mniejsze od baseSize.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave({ ...prefs, markerScale: { ...prefs.markerScale } });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="pdf-prefs-editor">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText aria-hidden="true" className="h-5 w-5 text-forest-700" />
          Preferencje PDF
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-stone-700">Domyślny układ raportu</legend>
          {LAYOUT_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="config-pdf-layout"
                value={option.value}
                checked={prefs.layout === option.value}
                onChange={() => {
                  setPrefs((current) => ({ ...current, layout: option.value }));
                  setSaved(false);
                }}
                data-testid={`config-layout-${option.value}`}
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-stone-700">Rozmiar markerów</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="config-marker-size"
              checked={prefs.markerSizeBy === 'circumference'}
              onChange={() => {
                setPrefs((current) => ({ ...current, markerSizeBy: 'circumference' }));
                setSaved(false);
              }}
            />
            Zależny od obwodu
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="config-marker-size"
              checked={prefs.markerSizeBy === 'fixed'}
              onChange={() => {
                setPrefs((current) => ({ ...current, markerSizeBy: 'fixed' }));
                setSaved(false);
              }}
            />
            Stały
          </label>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <label className="text-xs text-stone-600">
              Rozmiar bazowy (px)
              <input
                type="number"
                min={0}
                step={0.5}
                value={prefs.markerScale.baseSize}
                onChange={(e) => {
                  setScaleValue('baseSize', e.target.value);
                }}
                data-testid="config-marker-base"
                className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-stone-600">
              Przyrost na cm (px)
              <input
                type="number"
                min={0}
                step={0.01}
                value={prefs.markerScale.perCm}
                onChange={(e) => {
                  setScaleValue('perCm', e.target.value);
                }}
                data-testid="config-marker-percm"
                className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-stone-600">
              Maks. rozmiar (px)
              <input
                type="number"
                min={1}
                step={0.5}
                value={prefs.markerScale.maxSize}
                onChange={(e) => {
                  setScaleValue('maxSize', e.target.value);
                }}
                data-testid="config-marker-max"
                className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={prefs.autoRotate}
            onChange={() => {
              toggle('autoRotate');
            }}
            data-testid="config-pref-rotate"
          />
          Automatyczny obrót mapy
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={prefs.tableOnSeparatePage}
            onChange={() => {
              toggle('tableOnSeparatePage');
            }}
            data-testid="config-pref-separate"
          />
          Tabela na osobnej stronie
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={prefs.showNumberedTable}
            onChange={() => {
              toggle('showNumberedTable');
            }}
            data-testid="config-pref-numbered"
          />
          Numerowana lista drzew
        </label>

        <Button size="sm" variant="ghost" data-testid="pdf-prefs-reset" onClick={resetDefaults}>
          <RotateCcw aria-hidden="true" className="mr-1 h-4 w-4" />
          Przywróć domyślne
        </Button>

        {error !== null && (
          <p className="text-sm text-red-600" role="alert" data-testid="pdf-prefs-error">
            {error}
          </p>
        )}
        {saved && (
          <p className="text-sm text-forest-700" role="status" data-testid="pdf-prefs-saved">
            Zapisano preferencje.
          </p>
        )}

        <Button
          variant="primary"
          size="sm"
          data-testid="pdf-prefs-save"
          disabled={saving}
          onClick={() => {
            void handleSave();
          }}
        >
          {saving ? 'Zapisywanie…' : 'Zapisz preferencje'}
        </Button>
      </CardContent>
    </Card>
  );
}
