const EARTH_CIRCUMFERENCE_M = 400_75016.686;
const TILE_SIZE_PX = 256;
export const SCALE_20M_TARGET_METERS = 20;
export const SCALE_20M_VIEWPORT_FRACTION = 0.6;
export const SCALE_20M_MAX_ZOOM = 22;

const CONTROL_TEST_IDS: readonly (readonly [selector: string, testId: string])[] = [
  ['.maplibregl-ctrl-attrib', 'map-attribution'],
  ['.maplibregl-ctrl-scale', 'map-scale'],
  ['.maplibregl-ctrl-zoom-in', 'map-zoom-in'],
  ['.maplibregl-ctrl-zoom-out', 'map-zoom-out'],
  ['.maplibregl-ctrl-compass', 'map-compass'],
];

export function tagMaplibreControls(container: HTMLElement | null): void {
  if (container === null) {
    return;
  }
  for (const [selector, testId] of CONTROL_TEST_IDS) {
    container.querySelector(selector)?.setAttribute('data-testid', testId);
  }
}

export function zoomForScale20M(
  viewportWidth: number,
  viewportHeight: number,
  latitude: number,
): number {
  const spanPx = SCALE_20M_VIEWPORT_FRACTION * Math.min(viewportWidth, viewportHeight);
  const metersPerPixel = SCALE_20M_TARGET_METERS / spanPx;
  const circumferenceAtLatitude =
    EARTH_CIRCUMFERENCE_M * Math.cos((latitude * Math.PI) / 180);
  const zoom = Math.log2(circumferenceAtLatitude / (TILE_SIZE_PX * metersPerPixel));
  return Math.min(SCALE_20M_MAX_ZOOM, zoom);
}
