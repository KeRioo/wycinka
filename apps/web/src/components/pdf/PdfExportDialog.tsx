import { AnimatePresence, motion } from 'framer-motion';
import { FileDown, X } from 'lucide-react';
import { useState } from 'react';
import type { PdfPrefs, Project, Tree } from '@/db/schema';
import { generatePdfReport, pdfFileName } from '@/lib/pdf/pdfReport';
import { api } from '@/services/api';
import type { Parcel, ParcelAggregateResponse } from '@/services/api.types';
import { useProjectStore } from '@/stores/projectStore';
import PdfMapPreview from './PdfMapPreview';
import Compass from './Compass';

const LAYOUT_OPTIONS: readonly { value: PdfPrefs['layout']; label: string; hint: string }[] = [
  {
    value: 'single',
    label: 'Klasyczny raport',
    hint: 'Mapa i tabela zbiorcza na jednej stronie; pełna lista na kolejnej',
  },
  {
    value: 'combined',
    label: 'Wszystko na jednej stronie',
    hint: 'Mapa, tabela zbiorcza i pełna lista drzew razem',
  },
  {
    value: 'one-per-page',
    label: 'Sekcje na osobnych stronach',
    hint: 'Mapa osobno, tabele na kolejnych stronach',
  },
];

export interface PdfExportDialogProps {
  open: boolean;
  project: Project;
  trees: readonly Tree[];
  parcels?: readonly Parcel[];
  onClose: () => void;
}

export default function PdfExportDialog({
  open,
  project,
  trees,
  parcels = [],
  onClose,
}: PdfExportDialogProps): JSX.Element {
  const [prefs, setPrefs] = useState<PdfPrefs>(project.pdfPrefs);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savePdfPrefs = useProjectStore((s) => s.savePdfPrefs);

  const setLayout = (layout: PdfPrefs['layout']): void => {
    setPrefs((current) => ({ ...current, layout }));
  };

  const toggle = (key: 'tableOnSeparatePage' | 'showNumberedTable' | 'autoRotate'): void => {
    setPrefs((current) => ({ ...current, [key]: !current[key] }));
  };

  const handleGenerate = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await savePdfPrefs(project.id, prefs);
      let aggregate: ParcelAggregateResponse | null = null;
      if (parcels.length > 1) {
        try {
          aggregate = await api.aggregateParcels(parcels.map((p) => p.teryt));
        } catch {
          aggregate = null;
        }
      }
      const doc = generatePdfReport({
        project: { ...project, pdfPrefs: prefs },
        trees,
        parcels,
        ...(aggregate !== null ? { aggregate } : {}),
      });
      doc.save(pdfFileName(project, new Date()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd generowania PDF');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          data-testid="pdf-export-dialog"
          className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/50 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-md rounded-lg bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <h2 className="text-lg font-semibold text-forest-900">Eksport PDF</h2>
              <button
                type="button"
                aria-label="Zamknij eksport PDF"
                data-testid="pdf-export-close"
                onClick={onClose}
                className="rounded p-1 text-stone-500 hover:bg-stone-100"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </header>

            <div className="space-y-4 p-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-stone-700">Układ raportu</legend>
                {LAYOUT_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    data-testid={`pdf-layout-${option.value}`}
                    className="flex cursor-pointer items-start gap-2 rounded border border-stone-200 p-2 hover:bg-stone-50"
                  >
                    <input
                      type="radio"
                      name="pdf-layout"
                      value={option.value}
                      checked={prefs.layout === option.value}
                      onChange={() => {
                        setLayout(option.value);
                      }}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-medium text-forest-900">
                        {option.label}
                      </span>
                      <span className="block text-xs text-stone-500">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <label className="flex items-center gap-2 text-sm text-forest-900">
                <input
                  type="checkbox"
                  checked={prefs.tableOnSeparatePage}
                  onChange={() => {
                    toggle('tableOnSeparatePage');
                  }}
                  data-testid="pdf-pref-separate"
                />
                Tabela na osobnej stronie
              </label>

              <label className="flex items-center gap-2 text-sm text-forest-900">
                <input
                  type="checkbox"
                  checked={prefs.showNumberedTable}
                  onChange={() => {
                    toggle('showNumberedTable');
                  }}
                  data-testid="pdf-pref-numbered"
                />
                Numerowana lista drzew
              </label>

              <label className="flex items-center gap-2 text-sm text-forest-900">
                <input
                  type="checkbox"
                  checked={prefs.autoRotate}
                  onChange={() => {
                    toggle('autoRotate');
                  }}
                  data-testid="pdf-pref-rotate"
                />
                Automatyczny obrót mapy
              </label>

              <div className="space-y-2">
                <p className="text-sm font-medium text-stone-700">Podgląd układu (strona 1)</p>
                <PdfMapPreview project={project} trees={trees} parcels={parcels} prefs={prefs} />
              </div>

              <div className="flex items-center justify-between rounded border border-stone-200 bg-stone-50 p-3">
                <p className="text-xs text-stone-500">
                  Kompas: północ prawdziwa{prefs.autoRotate ? ', obrót mapy' : ''}
                </p>
                <Compass size={56} rotationDeg={prefs.autoRotate ? 45 : 0} />
              </div>

              {error !== null && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-stone-200 px-4 py-3">
              <button
                type="button"
                className="rounded-md px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
                onClick={onClose}
              >
                Anuluj
              </button>
              <button
                type="button"
                data-testid="pdf-export-generate"
                disabled={saving || trees.length === 0}
                onClick={() => {
                  void handleGenerate();
                }}
                className="inline-flex items-center gap-2 rounded-md bg-forest-700 px-4 py-2 text-sm font-medium text-white hover:bg-forest-800 disabled:cursor-not-allowed disabled:bg-forest-300"
              >
                <FileDown aria-hidden="true" className="h-4 w-4" />
                {saving ? 'Generowanie…' : 'Generuj PDF'}
              </button>
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
