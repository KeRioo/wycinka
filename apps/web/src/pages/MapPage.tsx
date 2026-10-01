import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import maplibregl, { type Map as MaplibreMap } from 'maplibre-gl';
import MapClickHandler from '@/components/map/MapClickHandler';
import ParcelPopup from '@/components/map/ParcelPopup';
import AddTreePanel from '@/components/trees/AddTreePanel';
import Fab from '@/components/trees/Fab';
import { buildPendingFeature, treesToFeatureCollection } from '@/components/trees/TreeMarkers';
import type { TreeFeatureProperties } from '@/components/map/MapView';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useMapStore } from '@/stores/mapStore';
import { useProjectStore } from '@/stores/projectStore';
import { draftPosition, useTreeStore } from '@/stores/treeStore';

const DEFAULT_ZOOM = 13;

export default function MapPage(): JSX.Element {
  const mapRef = useRef<MaplibreMap | null>(null);
  const popupRootRef = useRef<Root | null>(null);
  const popupContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedParcel = useMapStore((s) => s.selectedParcel);
  const isLoading = useMapStore((s) => s.isLoading);
  const error = useMapStore((s) => s.error);
  const setSelected = useMapStore((s) => s.setSelectedParcel);
  const setError = useMapStore((s) => s.setError);

  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projectsStatus = useProjectStore((s) => s.status);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const createAndActivate = useProjectStore((s) => s.createAndActivate);

  const mode = useTreeStore((s) => s.mode);
  const pending = useTreeStore((s) => s.pending);
  const trees = useTreeStore((s) => s.trees);
  const loadTrees = useTreeStore((s) => s.loadTrees);
  const startPlacing = useTreeStore((s) => s.startPlacing);
  const cancelTree = useTreeStore((s) => s.cancel);
  const activeProjectIdFromTree = useTreeStore((s) => s.activeProjectId);

  const { position, error: gpsError, loading: gpsLoading, refresh } = useGeolocation();

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (activeProjectId !== null && activeProjectId !== activeProjectIdFromTree) {
      void loadTrees(activeProjectId);
    }
  }, [activeProjectId, activeProjectIdFromTree, loadTrees]);

  const handleMapReady = useCallback((map: MaplibreMap) => {
    mapRef.current = map;
  }, []);

  const handleTreeClick = useCallback((id: string) => {
    useTreeStore.getState().selectTreeForEdit(id);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (!selectedParcel) {
      popupRootRef.current?.unmount();
      popupRootRef.current = null;
      if (popupContainerRef.current) {
        popupContainerRef.current.innerHTML = '';
      }
      return;
    }

    popupContainerRef.current ??= document.createElement('div');

    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      offset: 12,
      maxWidth: '320px',
    })
      .setLngLat([selectedParcel.centroid[0], selectedParcel.centroid[1]])
      .setDOMContent(popupContainerRef.current)
      .addTo(map);

    popupRootRef.current ??= createRoot(popupContainerRef.current);
    popupRootRef.current.render(<ParcelPopup parcel={selectedParcel} />);

    map.flyTo({
      center: [selectedParcel.centroid[0], selectedParcel.centroid[1]],
      zoom: DEFAULT_ZOOM,
      duration: 800,
    });

    return () => {
      popup.remove();
    };
  }, [selectedParcel]);

  const treeLayer = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point, TreeFeatureProperties> | null>(() => {
    if (mode === 'placing' || mode === 'editing') {
      if (pending === null) {
        return null;
      }
      const pos = draftPosition(pending);
      const pendingFeature = buildPendingFeature(
        pos.lat,
        pos.lng,
        pending.species,
        pending.circumference,
      );
      return treesToFeatureCollection(trees, pendingFeature);
    }
    return treesToFeatureCollection(trees);
  }, [trees, pending, mode]);

  const handleStartPlacing = (): void => {
    if (activeProjectId === null) {
      return;
    }
    if (position !== null) {
      startPlacing({ gpsPosition: position });
    } else {
      startPlacing();
    }
  };

  const handleCreateProject = async (): Promise<void> => {
    await createAndActivate('Mój pierwszy projekt');
  };

  const hasProject = activeProjectId !== null && projects.length > 0;
  const isLoadingProjects = projectsStatus === 'loading';

  return (
    <div className="relative h-full w-full">
      <MapClickHandler
        onMapReady={handleMapReady}
        treeLayer={treeLayer}
        onTreeClick={handleTreeClick}
      />

      <aside className="pointer-events-none absolute left-4 top-4 max-w-sm space-y-2">
        {isLoading && (
          <Card className="pointer-events-auto">
            <CardContent className="flex items-center gap-3 p-3 text-sm text-forest-700">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-forest-500 border-t-transparent"
              />
              Wyszukiwanie działki…
            </CardContent>
          </Card>
        )}
        {error !== null && (
          <Card className="pointer-events-auto border-red-300 bg-red-50">
            <CardContent className="space-y-2 p-3 text-sm text-red-800">
              <p className="font-medium">Błąd</p>
              <p>{error}</p>
              <Button size="sm" variant="secondary" onClick={() => { setError(null); }}>
                Zamknij
              </Button>
            </CardContent>
          </Card>
        )}
        {selectedParcel && (
          <Card className="pointer-events-auto">
            <CardHeader className="flex flex-row items-center justify-between gap-2 p-3">
              <CardTitle className="text-sm">Wybrana działka</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => { setSelected(null); }}>
                Zamknij
              </Button>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <ParcelPopup parcel={selectedParcel} />
            </CardContent>
          </Card>
        )}
        {!hasProject && !isLoadingProjects && projects.length === 0 && (
          <Card className="pointer-events-auto">
            <CardContent className="space-y-3 p-4 text-sm text-stone-700">
              <p>Brak projektu. Utwórz pierwszy projekt, aby zacząć dodawać drzewa.</p>
              <Button
                size="sm"
                variant="primary"
                data-testid="create-first-project"
                onClick={() => {
                  void handleCreateProject();
                }}
              >
                Utwórz projekt
              </Button>
            </CardContent>
          </Card>
        )}
      </aside>

      {hasProject && mode === 'idle' && (
        <Fab onClick={handleStartPlacing} />
      )}

      <AddTreePanel
        gpsPosition={position}
        gpsLoading={gpsLoading}
        gpsError={gpsError}
        onRefreshGps={refresh}
      />

      {mode === 'placing' || mode === 'editing' ? (
        <button
          type="button"
          aria-label="Anuluj"
          data-testid="cancel-floating"
          onClick={cancelTree}
          className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-md bg-stone-100 px-3 py-1 text-xs text-stone-600 shadow hover:bg-stone-200"
        />
      ) : null}

      <noscript className="absolute inset-0 flex items-center justify-center bg-stone-100 p-4 text-center">
        <p className="text-stone-700">Mapa wymaga włączonej obsługi JavaScript.</p>
      </noscript>
    </div>
  );
}
