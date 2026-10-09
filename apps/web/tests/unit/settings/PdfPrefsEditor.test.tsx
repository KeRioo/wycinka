import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PdfPrefsEditor from '@/components/settings/PdfPrefsEditor';
import { DEFAULT_PDF_PREFS, type PdfPrefs } from '@/db/schema';

const INITIAL: PdfPrefs = { ...DEFAULT_PDF_PREFS };

describe('PdfPrefsEditor', () => {
  it('should render default prefs', () => {
    render(<PdfPrefsEditor initial={INITIAL} onSave={vi.fn()} />);
    expect(screen.getByTestId('config-layout-single')).toBeChecked();
    expect(screen.getByTestId('config-pref-rotate')).toBeChecked();
  });

  it('should change layout preference', async () => {
    render(<PdfPrefsEditor initial={INITIAL} onSave={vi.fn()} />);
    await userEvent.click(screen.getByTestId('config-layout-one-per-page'));
    expect(screen.getByTestId('config-layout-one-per-page')).toBeChecked();
  });

  it('should change markerScale values', () => {
    render(<PdfPrefsEditor initial={INITIAL} onSave={vi.fn()} />);
    const base = screen.getByTestId('config-marker-base');
    expect(base).toHaveValue(3);
    const max = screen.getByTestId('config-marker-max');
    expect(max).toHaveValue(18);
  });

  it('should persist markerScale through save', async () => {
    const onSave = vi.fn((_prefs: PdfPrefs): Promise<void> => Promise.resolve());
    render(<PdfPrefsEditor initial={INITIAL} onSave={onSave} />);
    await userEvent.clear(screen.getByTestId('config-marker-base'));
    await userEvent.type(screen.getByTestId('config-marker-base'), '5');
    await userEvent.clear(screen.getByTestId('config-marker-percm'));
    await userEvent.type(screen.getByTestId('config-marker-percm'), '0.1');
    await userEvent.click(screen.getByTestId('pdf-prefs-save'));
    await waitFor(() => {
      expect(screen.getByTestId('pdf-prefs-saved')).toBeInTheDocument();
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ markerScale: { baseSize: 5, perCm: 0.1, maxSize: 18 } }),
    );
  });

  it('should toggle all checkboxes', async () => {
    const onSave = vi.fn((_prefs: PdfPrefs): Promise<void> => Promise.resolve());
    render(<PdfPrefsEditor initial={INITIAL} onSave={onSave} />);
    await userEvent.click(screen.getByTestId('config-pref-rotate'));
    await userEvent.click(screen.getByTestId('config-pref-separate'));
    await userEvent.click(screen.getByTestId('config-pref-numbered'));
    await userEvent.click(screen.getByTestId('pdf-prefs-save'));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved?.autoRotate).toBe(false);
    expect(saved?.tableOnSeparatePage).toBe(true);
    expect(saved?.showNumberedTable).toBe(false);
  });

  it('should switch markerSizeBy to fixed', async () => {
    render(<PdfPrefsEditor initial={INITIAL} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Stały' }));
    expect(screen.getByRole('radio', { name: 'Stały' })).toBeChecked();
    await userEvent.click(screen.getByTestId('pdf-prefs-save'));
  });

  it('should reject maxSize below baseSize', async () => {
    render(<PdfPrefsEditor initial={INITIAL} onSave={vi.fn()} />);
    await userEvent.clear(screen.getByTestId('config-marker-max'));
    await userEvent.type(screen.getByTestId('config-marker-max'), '1');
    await userEvent.click(screen.getByTestId('pdf-prefs-save'));
    expect(screen.getByTestId('pdf-prefs-error')).toHaveTextContent('od baseSize');
  });

  it('should restore default prefs on reset', async () => {
    const modified: PdfPrefs = { ...DEFAULT_PDF_PREFS, layout: 'combined', autoRotate: false };
    render(<PdfPrefsEditor initial={modified} onSave={vi.fn()} />);
    await userEvent.click(screen.getByTestId('pdf-prefs-reset'));
    expect(screen.getByTestId('config-layout-single')).toBeChecked();
    expect(screen.getByTestId('config-pref-rotate')).toBeChecked();
  });

  it('should show save failure as error', async () => {
    const onSave = vi.fn((): Promise<void> => {
      throw new Error('fail');
    });
    render(<PdfPrefsEditor initial={INITIAL} onSave={onSave} />);
    await userEvent.click(screen.getByTestId('pdf-prefs-save'));
    await waitFor(() => {
      expect(screen.getByTestId('pdf-prefs-error')).toHaveTextContent('fail');
    });
  });
});
