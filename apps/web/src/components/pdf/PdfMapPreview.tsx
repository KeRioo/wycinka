import type { PdfPrefs, Project, Tree } from '@/db/schema';
import type { Parcel } from '@/services/api.types';
import { compassNeedle } from '@/lib/pdf/compass';
import { buildPdfPagePlan } from '@/lib/pdf/pagePlan';
import { computeMapLayout } from '@/lib/pdf/mapLayout';
import type { PdfExportInput } from '@/lib/pdf/pdfReport';

const PAGE_W_MM = 210;
const PAGE_H_MM = 297;

export interface PdfMapPreviewProps {
  project: Project;
  trees: readonly Tree[];
  parcels?: readonly Parcel[];
  prefs?: PdfPrefs;
}

export default function PdfMapPreview({
  project,
  trees,
  parcels = [],
  prefs = project.pdfPrefs,
}: PdfMapPreviewProps): JSX.Element {
  const input = { project: { ...project, pdfPrefs: prefs }, trees, parcels } satisfies PdfExportInput;
  const plan = buildPdfPagePlan(input.project.pdfPrefs);
  const compact = plan[0].rangesTable;
  const layout = computeMapLayout(input, compact);
  const compassNeedleData =
    layout === null
      ? null
      : (() => {
          const cx = layout.rect.x + layout.rect.w - 10;
          const cy = layout.rect.y + 10;
          return { cx, cy, needle: compassNeedle(cx, cy, 5, layout.rotationDeg) };
        })();

  return (
    <svg
      data-testid="pdf-preview-svg"
      viewBox={`0 0 ${String(PAGE_W_MM)} ${String(PAGE_H_MM)}`}
      className="w-full border border-stone-200 bg-white"
      aria-label="Podgląd pierwszej strony raportu"
      role="img"
    >
      <rect
        x={1}
        y={1}
        width={PAGE_W_MM - 2}
        height={PAGE_H_MM - 2}
        fill="none"
        stroke="#d6d3d1"
        strokeWidth={0.5}
      />
      {layout === null ? (
        <text x={PAGE_W_MM / 2} y={160} textAnchor="middle" fontSize={8} fill="#6b7280">
          Brak działki w projekcie
        </text>
      ) : (
        <>
          <rect
            x={layout.rect.x}
            y={layout.rect.y}
            width={layout.rect.w}
            height={layout.rect.h}
            fill="#fafaf9"
            stroke="#166534"
            strokeWidth={0.4}
          />
          {layout.rings.map((ring, ringIndex) => (
            <polyline
              key={`ring-${String(ringIndex)}`}
              points={ring
                .map((point) => `${point[0].toFixed(2)},${point[1].toFixed(2)}`)
                .join(' ')}
              fill="none"
              stroke={layout.rings.length > 1 ? '#1e3a8a' : '#15803d'}
              strokeWidth={0.5}
            />
          ))}
          {layout.markers.map((marker, markerIndex) => (
            <g key={`marker-${String(markerIndex)}`}>
              <circle cx={marker.x} cy={marker.y} r={marker.r} fill={marker.color} />
              {marker.label !== undefined && (
                <text
                  x={marker.x + marker.r + 1.4}
                  y={marker.y - marker.r - 0.8}
                  fontSize={2.6}
                  fill="#111827"
                >
                  {marker.label}
                </text>
              )}
            </g>
          ))}
          {compassNeedleData !== null && (
            <g>
              <circle
                cx={compassNeedleData.cx}
                cy={compassNeedleData.cy}
                r={5}
                fill="white"
                stroke="#111827"
                strokeWidth={0.3}
              />
              <line
                x1={compassNeedleData.needle.northX}
                y1={compassNeedleData.needle.northY}
                x2={compassNeedleData.cx}
                y2={compassNeedleData.cy}
                stroke="#b91c1c"
                strokeWidth={0.5}
              />
              <line
                x1={compassNeedleData.cx}
                y1={compassNeedleData.cy}
                x2={compassNeedleData.needle.southX}
                y2={compassNeedleData.needle.southY}
                stroke="#111827"
                strokeWidth={0.5}
              />
              <text
                x={compassNeedleData.needle.labelX}
                y={compassNeedleData.needle.labelY}
                textAnchor="middle"
                fontSize={2.8}
                fill="#111827"
              >
                N
              </text>
            </g>
          )}
        </>
      )}
    </svg>
  );
}
