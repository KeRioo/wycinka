import { useRef, useState } from 'react';
import { Download, FileJson, Upload } from 'lucide-react';
import { BackupError, downloadBackup, exportBackup, importBackup, parseBackup } from '@/lib/backup';
import type { BackupMode } from '@/lib/backup';
import { useProjectStore } from '@/stores/projectStore';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { resolve(reader.result as string); };
    reader.onerror = () => { reject(new Error('Nie udało się odczytać pliku')); };
    reader.readAsText(file);
  });
}

export default function BackupPanel(): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [mode, setMode] = useState<BackupMode>('merge');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshProjects = useProjectStore((s) => s.refresh);

  const handleExport = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const backup = await exportBackup();
      const date = new Date().toISOString().slice(0, 10);
      downloadBackup(backup, `wycinka-backup-${date}.json`);
      setMessage('Plik kopii zapasowej został pobrany.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd eksportu');
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = (files: FileList | null): void => {
    setPendingFile(files?.[0] ?? null);
    setMessage(null);
    setError(null);
  };

  const handleImport = async (): Promise<void> => {
    if (pendingFile === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const text = await readFileText(pendingFile);
      const backup = parseBackup(text);
      const result = await importBackup(backup, mode);
      await refreshProjects();
      setMessage(
        `Import zakończony (${result.mode === 'overwrite' ? 'nadpisanie' : 'scalanie'}): projekty ${String(result.projects)}, drzewa ${String(result.trees)}.`,
      );
      setPendingFile(null);
      if (fileInputRef.current !== null) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      if (err instanceof BackupError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Nieznany błąd importu');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="backup-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileJson aria-hidden="true" className="h-5 w-5 text-forest-700" />
          Kopia zapasowa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-stone-600">
          Wyeksportuj wszystkie projekty i drzewa do jednego pliku JSON lub przywróć je z kopii.
        </p>

        <Button
          variant="secondary"
          size="sm"
          data-testid="backup-export"
          disabled={busy}
          onClick={() => {
            void handleExport();
          }}
        >
          <Download aria-hidden="true" className="mr-1 h-4 w-4" />
          Eksportuj kopię (JSON)
        </Button>

        <div className="space-y-2 border-t border-stone-200 pt-4">
          <label className="block text-sm font-medium text-stone-700" htmlFor="backup-file">
            Plik kopii
          </label>
          <input
            id="backup-file"
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            data-testid="backup-file-input"
            onChange={(e) => {
              handleFileChange(e.target.files);
            }}
            className="w-full text-sm"
          />

          <fieldset className="space-y-1">
            <legend className="text-sm font-medium text-stone-700">Tryb importu</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="backup-mode"
                value="overwrite"
                checked={mode === 'overwrite'}
                onChange={() => {
                  setMode('overwrite');
                }}
              />
              Nadpisz — usuń obecną zawartość i wgraj plik
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="backup-mode"
                value="merge"
                checked={mode === 'merge'}
                onChange={() => {
                  setMode('merge');
                }}
              />
              Scal — dodaj tylko rekordy o nowych id
            </label>
          </fieldset>

          <Button
            variant="primary"
            size="sm"
            data-testid="backup-import"
            disabled={busy || pendingFile === null}
            onClick={() => {
              void handleImport();
            }}
          >
            <Upload aria-hidden="true" className="mr-1 h-4 w-4" />
            Importuj
          </Button>
        </div>

        {message !== null && (
          <p className="text-sm text-forest-700" role="status" data-testid="backup-success">
            {message}
          </p>
        )}
        {error !== null && (
          <p className="text-sm text-red-600" role="alert" data-testid="backup-error">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
