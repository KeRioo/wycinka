import { formatArea, formatCoordinate } from '@/lib/utils';
import type { Parcel } from '@/services/api.types';

interface ParcelPopupProps {
  parcel: Parcel;
}

export default function ParcelPopup({ parcel }: ParcelPopupProps): JSX.Element {
  return (
    <div className="min-w-[240px] space-y-2 text-sm text-forest-900">
      <header>
        <h3 className="text-base font-semibold text-forest-700">{parcel.teryt}</h3>
        <p className="text-xs text-stone-500">Numer działki: {parcel.number}</p>
      </header>
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
        <dd className="font-mono text-xs">{formatCoordinate(parcel.centroid[1], parcel.centroid[0])}</dd>
      </dl>
    </div>
  );
}
