import { compassNeedle } from '@/lib/pdf/compass';

export interface CompassProps {
  size: number;
  rotationDeg: number;
}

export default function Compass({ size, rotationDeg }: CompassProps): JSX.Element {
  const half = size / 2;
  const radius = half - 10;
  const needle = compassNeedle(half, half, radius, rotationDeg);
  const labelRadius = radius + 7;
  const needleAngle = Math.atan2(needle.northY - half, needle.northX - half);
  const labelX = half + labelRadius * Math.cos(needleAngle);
  const labelY = half + labelRadius * Math.sin(needleAngle);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      role="img"
      aria-label="Kompas — północ prawdziwa"
      data-testid="compass-svg"
      data-rotation={String(rotationDeg)}
    >
      <circle cx={half} cy={half} r={radius} fill="none" stroke="#111827" strokeWidth={1.5} />
      <line x1={needle.northX} y1={needle.northY} x2={half} y2={half} stroke="#b91c1c" strokeWidth={2} />
      <line x1={half} y1={half} x2={needle.southX} y2={needle.southY} stroke="#111827" strokeWidth={2} />
      <text
        x={labelX}
        y={labelY + 3}
        textAnchor="middle"
        fontSize={10}
        fontWeight="bold"
        fill="#111827"
      >
        N
      </text>
    </svg>
  );
}
