import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
