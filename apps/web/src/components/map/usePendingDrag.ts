import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MaplibreMap } from 'maplibre-gl';
import { snapThresholdMeters, snapToVertex, type LatLng } from '@/lib/snap';

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

interface PendingDragOptions {
  map: MaplibreMap | null;
  ready: boolean;
  enabled: boolean;
  vertices: readonly LatLng[];
  onMove: (pos: LatLng) => void;
  onEnd: (pos: LatLng) => void;
}

interface DragEventLike {
  lngLat: { lat: number; lng: number };
  preventDefault?: () => void;
}

function pointFeature(pos: LatLng): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] },
        properties: {},
      },
    ],
  };
}

export function usePendingMarkerDrag(options: PendingDragOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const { map, ready, enabled } = optionsRef.current;
    if (map === null || !ready || !enabled) {
      return;
    }

    let dragging = false;
    const canvas = map.getCanvas();
    const source = map.getSource<maplibregl.GeoJSONSource>('snap-indicator');
    const marker = new maplibregl.Marker({ element: createIndicatorElement() });

    const resolve = (lngLat: { lat: number; lng: number }): LatLng => {
      const { vertices } = optionsRef.current;
      const threshold = snapThresholdMeters(map.getZoom(), map.getCenter().lat);
      const snapped = snapToVertex(
        { lat: lngLat.lat, lng: lngLat.lng },
        vertices,
        threshold,
      );
      const pos = snapped !== null ? snapped.point : { lat: lngLat.lat, lng: lngLat.lng };
      if (snapped !== null) {
        marker.setLngLat([pos.lng, pos.lat]).addTo(map);
      } else {
        marker.remove();
      }
      source?.setData(snapped !== null ? pointFeature(pos) : EMPTY_FC);
      return pos;
    };

    const startDrag = (e: DragEventLike): void => {
      e.preventDefault?.();
      dragging = true;
      canvas.style.cursor = 'grabbing';
      map.dragPan.disable();
      const startPos = resolve(e.lngLat);
      optionsRef.current.onMove(startPos);
    };

    const onMove = (e: DragEventLike): void => {
      if (!dragging) {
        return;
      }
      const movePos = resolve(e.lngLat);
      optionsRef.current.onMove(movePos);
    };

    const endDrag = (e: DragEventLike): void => {
      if (!dragging) {
        return;
      }
      dragging = false;
      canvas.style.cursor = '';
      map.dragPan.enable();
      const finalPos = resolve(e.lngLat);
      optionsRef.current.onEnd(finalPos);
      marker.remove();
      source?.setData(EMPTY_FC);
    };

    map.on('mousedown', 'trees-pending-circle', startDrag);
    map.on('touchstart', 'trees-pending-circle', startDrag);
    map.on('mousemove', onMove);
    map.on('touchmove', onMove);
    map.on('mouseup', endDrag);
    map.on('touchend', endDrag);

    return () => {
      map.off('mousedown', 'trees-pending-circle', startDrag);
      map.off('touchstart', 'trees-pending-circle', startDrag);
      map.off('mousemove', onMove);
      map.off('touchmove', onMove);
      map.off('mouseup', endDrag);
      map.off('touchend', endDrag);
      marker.remove();
      if (dragging) {
        map.dragPan.enable();
      }
    };
  }, [options.map, options.ready, options.enabled]);
}

function createIndicatorElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'wycinka-snap-indicator';
  el.setAttribute('data-testid', 'snap-indicator');
  el.style.cssText =
    'width:16px;height:16px;border-radius:9999px;border:2px solid #0284c7;background:rgba(14,165,233,0.35);pointer-events:none;';
  return el;
}
