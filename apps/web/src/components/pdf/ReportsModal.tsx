import { AnimatePresence, motion } from 'framer-motion';
import { FileDown, FileText, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PdfPrefs, Project, Tree } from '@/db/schema';
import { DEFAULT_PDF_PREFS } from '@/db/schema';
import { generatePdfReport, pdfFileName } from '@/lib/pdf/pdfReport';
import { Button } from '@/components/ui';
import { api } from '@/services/api';
import type { Parcel, ParcelAggregateResponse } from '@/services/api.types';
import { useAppStore } from '@/stores/appStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTreeStore } from '@/stores/treeStore';
import PdfMapPreview from './PdfMapPreview';
import Compass from './Compass';

const LAYOUT_OPTIONS: readonly { value: PdfPrefs['layout']; label: string }[] = [
  { value: 'single', label: 'Klasyczny raport' },
  { value: 'combined', label: 'Wszystko na jednej stronie' },
  { value: 'one-per-page', label: 'Sekcje na osobnych stronach' },
];

function snapshotPdfPrefs(prefs: PdfPrefs): PdfPrefs {
  return { ...prefs, markerScale: { ...prefs.markerScale } };
}

function validatePrefs(prefs: PdfPrefs): string | null {
  if (
    prefs.markerScale.baseSize < 0 ||
    prefs.markerScale.perCm < 0 ||
    prefs.markerScale.maxSize <= 0
  ) {
    return 'Skala markerów: rozmiary nieujemne, maxSize > 0.';
  }
  if (prefs.markerScale.maxSize < prefs.markerScale.baseSize) {
    return 'maxSize nie może być mniejsze od baseSize.';
  }
  return null;
}

interface ReportsModalBodyProps {
  project: Project;
  trees: readonly Tree[];
  parcels: readonly Parcel[];
  prefs: PdfPrefs;
  onPrefs: (next: PdfPrefs) => void;
  onPersist: () => Promise<void>;
  onClose: () => void;
}

function ReportsModalBody({
  project,
  trees,
  parcels,
  prefs,
  onPrefs,
  onPersist,
  onClose,
}: ReportsModalBodyProps): JSX.Element {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLayout = (layout: PdfPrefs['layout']): void => {
    onPrefs({ ...prefs, layout });
  };

  const toggle = (key: 'tableOnSeparatePage' | 'showNumberedTable' | 'autoRotate'): void => {
    onPrefs({ ...prefs, [key]: !prefs[key] });
  };

  const setScaleValue = (key: keyof PdfPrefs['markerScale'], value: string): void => {
    const num = Number(value);
    onPrefs({
      ...prefs,
      markerScale: { ...prefs.markerScale, [key]: Number.isFinite(num) ? num : 0 },
    });
  };

  const handleGenerate = async (): Promise<void> => {
    const invalid = validatePrefs(prefs);
    if (invalid !== null) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onPersist();
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
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      role="dialog"
      aria-modal="true"
      aria-label="Generowanie raportów"
      className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-stone-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText aria-hidden="true" className="h-5 w-5 text-forest-700" />
          <h2 className="text-lg font-semibold text-forest-900">Generowanie raportów</h2>
        </div>
        <button
          type="button"
          aria-label="Zamknij generowanie raportów"
          data-testid="reports-close"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-sm text-stone-600">Projekt: {project.name}</p>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-stone-700">Układ raportu</legend>
          {LAYOUT_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 text-sm text-forest-900"
            >
              <input
                type="radio"
                name="reports-layout"
                value={option.value}
                checked={prefs.layout === option.value}
                onChange={() => {
                  setLayout(option.value);
                }}
                data-testid={`pdf-layout-${option.value}`}
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-stone-700">Tabele i lista</legend>
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
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-stone-700">Rozmiar i obrót markerów</legend>
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
          <label className="flex items-center gap-2 text-sm text-forest-900">
            <input
              type="radio"
              name="config-marker-size"
              checked={prefs.markerSizeBy === 'circumference'}
              onChange={() => {
                onPrefs({ ...prefs, markerSizeBy: 'circumference' });
              }}
            />
            Rozmiar zależny od obwodu
          </label>
          <label className="flex items-center gap-2 text-sm text-forest-900">
            <input
              type="radio"
              name="config-marker-size"
              checked={prefs.markerSizeBy === 'fixed'}
              onChange={() => {
                onPrefs({ ...prefs, markerSizeBy: 'fixed' });
              }}
            />
            Rozmiar stały
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

        <Button
          size="sm"
          variant="ghost"
          data-testid="reports-prefs-reset"
          onClick={() => {
            onPrefs(snapshotPdfPrefs(DEFAULT_PDF_PREFS));
            setError(null);
          }}
        >
          <RotateCcw aria-hidden="true" className="mr-1 h-4 w-4" />
          Przywróć domyślne
        </Button>

        {error !== null && (
          <p className="text-sm text-red-600" role="alert" data-testid="reports-error">
            {error}
          </p>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-stone-200 px-4 py-3">
        <Button
          size="md"
          variant="primary"
          data-testid="reports-generate"
          disabled={saving || trees.length === 0}
          onClick={() => {
            void handleGenerate();
          }}
        >
          <FileDown aria-hidden="true" className="mr-1 h-4 w-4" />
          {saving ? 'Generowanie…' : 'Generuj PDF'}
        </Button>
      </footer>
    </motion.div>
  );
}

export default function ReportsModal(): JSX.Element {
  const appModal = useAppStore((s) => s.appModal);
  const closeAppModal = useAppStore((s) => s.closeAppModal);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projects = useProjectStore((s) => s.projects);
  const projectParcels = useProjectStore((s) => s.projectParcels);
  const savePdfPrefs = useProjectStore((s) => s.savePdfPrefs);
  const trees = useTreeStore((s) => s.trees);

  const open = appModal === 'reports';
  const project: Project | null =
    activeProjectId !== null ? (projects.find((p) => p.id === activeProjectId) ?? null) : null;

  const [prefs, setPrefs] = useState<PdfPrefs | null>(null);
  const draftProjectRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      draftProjectRef.current = null;
      setPrefs(null);
      return;
    }
    if (project === null) {
      return;
    }
    if (draftProjectRef.current !== project.id) {
      draftProjectRef.current = project.id;
      setPrefs(snapshotPdfPrefs(project.pdfPrefs));
    }
  }, [open, project]);

  const persistDraft = async (): Promise<void> => {
    if (prefs === null || project === null) {
      return;
    }
    if (validatePrefs(prefs) !== null) {
      return;
    }
    await savePdfPrefs(project.id, prefs);
  };

  const closeReports = (): void => {
    void persistDraft();
    closeAppModal();
  };

  return (
    <AnimatePresence>
      {open && project !== null && prefs !== null && (
        <div
          data-testid="reports-modal"
          className="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/50 p-4"
        >
          <ReportsModalBody
            project={project}
            trees={trees}
            parcels={projectParcels}
            prefs={prefs}
            onPrefs={setPrefs}
            onPersist={persistDraft}
            onClose={closeReports}
          />
        </div>
      )}
    </AnimatePresence>
  );
}
