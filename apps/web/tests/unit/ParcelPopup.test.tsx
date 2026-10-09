import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ParcelPopup from '@/components/map/ParcelPopup';
import { MOCK_PARCEL_FOUND } from '@/test/mocks/api-responses';

const MOCK_PARCEL = MOCK_PARCEL_FOUND.found ? MOCK_PARCEL_FOUND.parcel : null;

describe('ParcelPopup', () => {
  it('should render all metadata fields', () => {
    if (!MOCK_PARCEL) {
      throw new Error('Mock parcel missing');
    }
    render(<ParcelPopup parcel={MOCK_PARCEL} />);
    expect(screen.getByText(MOCK_PARCEL.teryt)).toBeInTheDocument();
    expect(screen.getByText(/Numer działki:/)).toBeInTheDocument();
    expect(screen.getByText(MOCK_PARCEL.voivodeship)).toBeInTheDocument();
    expect(screen.getByText(MOCK_PARCEL.county)).toBeInTheDocument();
    expect(screen.getByText(MOCK_PARCEL.commune)).toBeInTheDocument();
    expect(screen.getByText(MOCK_PARCEL.land_use!)).toBeInTheDocument();
    expect(screen.getByText('14·12·01')).toBeInTheDocument();
    expect(screen.getByText(MOCK_PARCEL.datasource)).toBeInTheDocument();
  });

  it('should format area correctly', () => {
    if (!MOCK_PARCEL) {
      throw new Error('Mock parcel missing');
    }
    render(<ParcelPopup parcel={MOCK_PARCEL} />);
    expect(screen.getByText(/1235 m²/)).toBeInTheDocument();
  });

  it('should omit land_use row when null', () => {
    if (!MOCK_PARCEL) {
      throw new Error('Mock parcel missing');
    }
    const parcelWithoutLandUse = { ...MOCK_PARCEL, land_use: null };
    render(<ParcelPopup parcel={parcelWithoutLandUse} />);
    expect(screen.queryByText(/Użytek:/)).not.toBeInTheDocument();
  });
});

describe('ParcelPopup — parcel actions', () => {
  if (!MOCK_PARCEL) {
    throw new Error('Mock parcel missing');
  }
  const parcel = MOCK_PARCEL;
  it('should show add button when action add', () => {
    render(<ParcelPopup parcel={parcel} action={{ kind: 'add', disabled: false }} />);
    const btn = screen.getByTestId('add-parcel-to-project');
    expect(btn).toHaveTextContent('Dodaj do projektu');
    expect(btn).toBeEnabled();
  });

  it('should disable add button when disabled', () => {
    render(<ParcelPopup parcel={parcel} action={{ kind: 'add', disabled: true }} />);
    expect(screen.getByTestId('add-parcel-to-project')).toBeDisabled();
  });

  it('should call onAdd when add clicked', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<ParcelPopup parcel={parcel} action={{ kind: 'add', disabled: false }} onAdd={onAdd} />);
    await user.click(screen.getByTestId('add-parcel-to-project'));
    expect(onAdd).toHaveBeenCalledWith(parcel);
  });

  it('should show remove button when action remove and call onRemove', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<ParcelPopup parcel={parcel} action={{ kind: 'remove' }} onRemove={onRemove} />);
    const btn = screen.getByTestId('remove-parcel-from-project');
    expect(btn).toHaveTextContent('Usuń z projektu');
    await user.click(btn);
    expect(onRemove).toHaveBeenCalledWith(parcel.teryt);
  });

  it('should not render any action button for none', () => {
    render(<ParcelPopup parcel={parcel} />);
    expect(screen.queryByTestId('add-parcel-to-project')).not.toBeInTheDocument();
    expect(screen.queryByTestId('remove-parcel-from-project')).not.toBeInTheDocument();
  });
});
