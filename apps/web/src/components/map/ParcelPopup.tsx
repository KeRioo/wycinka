import { formatArea, formatCoordinate } from '@/lib/utils';
import type { Parcel } from '@/services/api.types';

export type ParcelPopupAction =
  { kind: 'add'; disabled: boolean } | { kind: 'remove' } | { kind: 'none' };

interface ParcelPopupProps {
  parcel: Parcel;
  action?: ParcelPopupAction;
  onAdd?: (parcel: Parcel) => void;
  onRemove?: (teryt: string) => void;
}

export default function ParcelPopup({
  parcel,
  action = { kind: 'none' },
  onAdd,
  onRemove,
}: ParcelPopupProps): JSX.Element {
  return (
    <div className="min-w-0 space-y-2 text-sm text-forest-900 sm:min-w-[240px]">
      <header>
        <h3 className="text-base font-semibold text-forest-700">{parcel.teryt}</h3>
        <p className="text-xs text-stone-500">Numer działki: {parcel.number}</p>
      </header>
      <div className="pt-1">
        {action.kind === 'add' && (
          <button
            type="button"
            data-testid="add-parcel-to-project"
            disabled={action.disabled}
            onClick={() => {
              onAdd?.(parcel);
            }}
            className="w-full rounded-md bg-forest-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-forest-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500"
          >
            ➕ Dodaj do projektu
          </button>
        )}
        {action.kind === 'remove' && (
          <button
            type="button"
            data-testid="remove-parcel-from-project"
            onClick={() => {
              onRemove?.(parcel.teryt);
            }}
            className="w-full rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            Usuń z projektu
          </button>
        )}
        {action.kind === 'none' && null}
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
        <dt className="font-medium text-stone-600">Woj.:</dt>
        <dd>{parcel.voivodeship}</dd>
        <dt className="font-medium text-stone-600">Powiat:</dt>
        <dd>{parcel.county}</dd>
        <dt className="font-medium text-stone-600">Gmina:</dt>
        <dd>{parcel.commune}</dd>
        <dt className="font-medium text-stone-600">Obręb:</dt>
        <dd>{parcel.region_name || parcel.region}</dd>
        {parcel.land_use !== null && (
          <>
            <dt className="font-medium text-stone-600">Użytek:</dt>
            <dd>{parcel.land_use}</dd>
          </>
        )}
        <dt className="font-medium text-stone-600">Pow.:</dt>
        <dd>{formatArea(parcel.area_m2)}</dd>
        <dt className="font-medium text-stone-600">Kody TERYT:</dt>
        <dd className="font-mono text-xs">
          {parcel.voivodeship_code}·{parcel.county_code}·{parcel.commune_code}
        </dd>
        <dt className="font-medium text-stone-600">Źródło:</dt>
        <dd className="text-xs">{parcel.datasource}</dd>
        <dt className="font-medium text-stone-600">Centroid:</dt>
        <dd className="font-mono text-xs">
          {formatCoordinate(parcel.centroid[1], parcel.centroid[0])}
        </dd>
      </dl>
    </div>
  );
}
