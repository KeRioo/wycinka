import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BackupPanel from '@/components/settings/BackupPanel';
import { addTree, createProject, db } from '@/db/schema';
import { BACKUP_SCHEMA_VERSION, exportBackup } from '@/lib/backup';
import { useProjectStore } from '@/stores/projectStore';

describe('BackupPanel', () => {
  beforeEach(async () => {
    db.delete();
    await db.open();
    useProjectStore.getState().clear();
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    if (db.isOpen()) {
      db.close();
    }
  });

  it('should export current data and show success message', async () => {
    await createProject({ name: 'Las Testowy' });
    const createObjectURL = URL.createObjectURL as ReturnType<typeof vi.fn>;
    render(<BackupPanel />);

    await userEvent.click(screen.getByTestId('backup-export'));

    await waitFor(() => {
      expect(screen.getByTestId('backup-success')).toHaveTextContent('pobrany');
    });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('should import overwrite mode replacing local data', async () => {
    await createProject({ name: 'Stary projekt' });
    const backup = await exportBackup();
    await db.projects.clear();

    render(<BackupPanel />);
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
    await userEvent.upload(screen.getByTestId('backup-file-input'), file);
    await userEvent.click(screen.getByRole('radio', { name: /Nadpisz/ }));
    await userEvent.click(screen.getByTestId('backup-import'));

    await waitFor(() => {
      expect(screen.getByTestId('backup-success')).toHaveTextContent('nadpisanie');
    });
    const projects = await db.projects.toArray();
    expect(projects[0]?.name).toBe('Stary projekt');
  });

  it('should import merge mode keeping local records', async () => {
    const project = await createProject({ name: 'Projekt lokalny' });
    const backup = await exportBackup();

    await db.projects.clear();
    await db.trees.clear();
    await createProject({ name: 'Projekt obecny' });
    await addTree({
      projectId: (await db.projects.toArray())[0]?.id ?? '',
      lat: 52.0,
      lng: 21.0,
      species: 'Brzoza',
      circumference: 60,
    });

    render(<BackupPanel />);
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
    await userEvent.upload(screen.getByTestId('backup-file-input'), file);
    await userEvent.click(screen.getByTestId('backup-import'));

    await waitFor(() => {
      expect(screen.getByTestId('backup-success')).toHaveTextContent('scalanie');
    });
    const projects = await db.projects.toArray();
    const names = projects.map((p) => p.name);
    expect(names).toContain('Projekt lokalny');
    expect(names).toContain('Projekt obecny');
    expect(project.id).toBeDefined();
    expect(projects).toHaveLength(2);
  });

  it('should show validation error for invalid file', async () => {
    await createProject({ name: 'Projekt' });
    render(<BackupPanel />);

    const file = new File(['{niepoprawny'], 'backup.json', { type: 'application/json' });
    await userEvent.upload(screen.getByTestId('backup-file-input'), file);
    await userEvent.click(screen.getByTestId('backup-import'));

    await waitFor(() => {
      expect(screen.getByTestId('backup-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('backup-error')).toHaveTextContent('JSON');
  });

  it('should show version error for future schemaVersion', async () => {
    await createProject({ name: 'Projekt' });
    render(<BackupPanel />);

    const future = { schemaVersion: BACKUP_SCHEMA_VERSION + 1, exportedAt: '2026-10-09T12:00:00Z', projects: [], trees: [] };
    const file = new File([JSON.stringify(future)], 'backup.json', { type: 'application/json' });
    await userEvent.upload(screen.getByTestId('backup-file-input'), file);
    await userEvent.click(screen.getByTestId('backup-import'));

    await waitFor(() => {
      expect(screen.getByTestId('backup-error')).toHaveTextContent('nowszej wersji');
    });
  });

  it('should disable import button when no file selected', () => {
    render(<BackupPanel />);
    expect(screen.getByTestId('backup-import')).toBeDisabled();
  });
});
