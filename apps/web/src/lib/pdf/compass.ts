export interface CompassNeedle {
  northX: number;
  northY: number;
  southX: number;
  southY: number;
  labelX: number;
  labelY: number;
}

export function compassNeedle(
  centerX: number,
  centerY: number,
  radius: number,
  rotationDeg: number,
): CompassNeedle {
  const rad = ((-rotationDeg - 90) * Math.PI) / 180;
  const nx = centerX + radius * Math.cos(rad);
  const ny = centerY + radius * Math.sin(rad);
  const sx = centerX - radius * Math.cos(rad);
  const sy = centerY - radius * Math.sin(rad);
  const labelRadius = radius + 4;
  return {
    northX: nx,
    northY: ny,
    southX: sx,
    southY: sy,
    labelX: centerX + labelRadius * Math.cos(rad),
    labelY: centerY + labelRadius * Math.sin(rad),
  };
}
