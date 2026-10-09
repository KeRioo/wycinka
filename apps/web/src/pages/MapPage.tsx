import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import maplibregl, { type Map as MaplibreMap } from 'maplibre-gl';
import { List, FileDown, X } from 'lucide-react';
import type { Parcel } from '@/services/api.types';
import MapClickHandler from '@/components/map/MapClickHandler';
import ParcelPopup, { type ParcelPopupAction } from '@/components/map/ParcelPopup';
import AddTreePanel from '@/components/trees/AddTreePanel';
import Fab from '@/components/trees/Fab';
import TreeListPanel from '@/components/trees/TreeListPanel';
import TreePopup from '@/components/trees/TreePopup';
import PdfExportDialog from '@/components/pdf/PdfExportDialog';
import { buildPendingFeature, treesToFeatureCollection } from '@/components/trees/TreeMarkers';
import type { TreeFeatureProperties } from '@/components/map/MapView';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useMapStore } from '@/stores/mapStore';
import { ensureActiveProject, useProjectStore } from '@/stores/projectStore';
import { draftPosition, useTreeStore } from '@/stores/treeStore';
import { parcelFitBounds } from '@/lib/geo';

export default function MapPage(): JSX.Element {
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<MaplibreMap | null>(null);
  const treePopupRootRef = useRef<Root | null>(null);
  const treePopupContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedParcel = useMapStore((s) => s.selectedParcel);
  const isLoading = useMapStore((s) => s.isLoading);
  const error = useMapStore((s) => s.error);
  const setSelected = useMapStore((s) => s.setSelectedParcel);
  const setError = useMapStore((s) => s.setError);

  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projectsStatus = useProjectStore((s) => s.status);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const projectParcels = useProjectStore((s) => s.projectParcels);
  const loadProjectParcels = useProjectStore((s) => s.loadProjectParcels);
  const addParcelToProject = useProjectStore((s) => s.addParcelToProject);
  const removeParcelFromProject = useProjectStore((s) => s.removeParcelFromProject);
  const toast = useProjectStore((s) => s.toast);
  const setToast = useProjectStore((s) => s.setToast);

  const mode = useTreeStore((s) => s.mode);
  const pending = useTreeStore((s) => s.pending);
  const trees = useTreeStore((s) => s.trees);
  const loadTrees = useTreeStore((s) => s.loadTrees);
  const startPlacing = useTreeStore((s) => s.startPlacing);
  const activeProjectIdFromTree = useTreeStore((s) => s.activeProjectId);
  const selectedTreeId = useTreeStore((s) => s.selectedTreeId);
  const setSelectedTreeId = useTreeStore((s) => s.setSelectedTreeId);
  const listPanelOpen = useTreeStore((s) => s.listPanelOpen);
  const setListPanelOpen = useTreeStore((s) => s.setListPanelOpen);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);

  const { position, error: gpsError, loading: gpsLoading, refresh } = useGeolocation({
    averagingSamples: mode === 'idle' ? 1 : 5,
  });

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    void loadProjectParcels(activeProjectId);
  }, [activeProjectId, loadProjectParcels]);

  useEffect(() => {
    if (toast === null) {
      return;
    }
    const timer = window.setTimeout(() => {
      setToast(null);
    }, 4000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [toast, setToast]);

  useEffect(() => {
    if (activeProjectId !== null && activeProjectId !== activeProjectIdFromTree) {
      void loadTrees(activeProjectId);
    }
  }, [activeProjectId, activeProjectIdFromTree, loadTrees]);

  const handleMapReady = useCallback((map: MaplibreMap) => {
    mapRef.current = map;
    setMapReady(true);
  }, []);

  const handleTreeClick = useCallback(
    (id: string, _lngLat: { lng: number; lat: number }) => {
      setSelectedTreeId(id);
    },
    [setSelectedTreeId],
  );

  const handleSelectTree = useCallback(
    (id: string) => {
      const tree = useTreeStore.getState().trees.find((t) => t.id === id);
      if (tree === undefined) {
        return;
      }
      setSelectedTreeId(id);
      const map = mapRef.current;
      if (map !== null) {
        map.flyTo({ center: [tree.lng, tree.lat], zoom: map.getZoom() });
      }
    },
    [setSelectedTreeId],
  );

  const handleDeleteTree = useCallback((id: string) => {
    void useTreeStore
      .getState()
      .deleteTree(id)
      .catch(() => {
        // the tree row disappears on success; on failure the popup/list stay as-is
      });
  }, []);

  const handleEditTree = useCallback(
    (id: string) => {
      useTreeStore.getState().selectTreeForEdit(id);
      useTreeStore.getState().setListPanelOpen(false);
    },
    [],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedParcel) {
      return;
    }
    const bounds = parcelFitBounds(selectedParcel.bbox, selectedParcel.geom);
    if (bounds !== null) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 800 });
    }
  }, [selectedParcel, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const tree =
      selectedTreeId !== null ? trees.find((t) => t.id === selectedTreeId) : undefined;

    if (tree === undefined) {
      treePopupRootRef.current?.render(null);
      return;
    }

    treePopupContainerRef.current ??= document.createElement('div');

    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      offset: 12,
      maxWidth: '320px',
    })
      .setLngLat([tree.lng, tree.lat])
      .setDOMContent(treePopupContainerRef.current)
      .addTo(map);

    treePopupRootRef.current ??= createRoot(treePopupContainerRef.current);
    treePopupRootRef.current.render(
      <TreePopup
        tree={tree}
        onEdit={() => {
          useTreeStore.getState().selectTreeForEdit(tree.id);
          setSelectedTreeId(null);
        }}
        onDelete={() => {
          void useTreeStore
            .getState()
            .deleteTree(tree.id)
            .then(() => {
              setSelectedTreeId(null);
            })
            .catch(() => {
              setSelectedTreeId(null);
            });
        }}
        onClose={() => {
          setSelectedTreeId(null);
        }}
      />,
    );

    return () => {
      popup.remove();
    };
  }, [selectedTreeId, trees, setSelectedTreeId, mapReady]);

  useEffect(() => {
    return () => {
      treePopupRootRef.current?.unmount();
      treePopupRootRef.current = null;
    };
  }, []);

  const pendingFocus = useMapStore((s) => s.focusTarget);
  const clearFocus = useMapStore((s) => s.clearFocusTarget);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || pendingFocus === null) {
      return;
    }
    map.flyTo({
      center: [pendingFocus.lng, pendingFocus.lat],
      zoom: map.getZoom(),
      duration: 500,
    });
    clearFocus();
  }, [pendingFocus, mapReady, clearFocus]);

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
    } else if (selectedParcel !== null) {
      startPlacing({ gpsPosition: { lat: selectedParcel.centroid[1], lng: selectedParcel.centroid[0] } });
    } else {
      startPlacing();
    }
  };

  const handleCreateProject = async (): Promise<void> => {
    await ensureActiveProject();
  };

  const hasProject = activeProjectId !== null && projects.length > 0;
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const isLoadingProjects = projectsStatus === 'loading';

  return (
    <div className="relative h-full w-full">
      <MapClickHandler
        onMapReady={handleMapReady}
        treeLayer={treeLayer}
        onTreeClick={handleTreeClick}
      />

      <aside
        data-testid="map-overlays"
        className="pointer-events-none absolute left-4 top-4 max-w-[70vw] space-y-2 sm:max-w-sm"
      >
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
          <ParcelCard
            parcel={selectedParcel}
            onClose={() => {
              setSelected(null);
            }}
            action={
              projectParcels.some((p) => p.teryt === selectedParcel.teryt)
                ? { kind: 'remove' }
                : { kind: 'add', disabled: activeProjectId === null }
            }
            onAdd={(parcel) => {
              void addParcelToProject(parcel);
            }}
            onRemove={(teryt) => {
              void removeParcelFromProject(teryt);
            }}
          />
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

      {toast !== null && (
        <div
          role="alert"
          data-testid="toast"
          className="pointer-events-auto absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-md bg-stone-900/90 px-4 py-2 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}

      {hasProject && mode === 'idle' && (
        <Fab onClick={handleStartPlacing} />
      )}

      {hasProject && (
        <button
          type="button"
          aria-label="Pokaż listę drzew"
          aria-expanded={listPanelOpen}
          data-testid="tree-list-toggle"
          onClick={() => {
            setListPanelOpen(!listPanelOpen);
          }}
          className="fixed bottom-14 left-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-white text-forest-800 shadow-lg transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2"
        >
          <List aria-hidden="true" className="h-6 w-6" />
        </button>
      )}

      {hasProject && (
        <button
          type="button"
          aria-label="Eksportuj PDF"
          data-testid="pdf-export-toggle"
          disabled={trees.length === 0}
          onClick={() => {
            setPdfDialogOpen(true);
          }}
          className="fixed bottom-14 left-20 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-white text-forest-800 shadow-lg transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2 disabled:text-stone-300"
        >
          <FileDown aria-hidden="true" className="h-6 w-6" />
        </button>
      )}

      {hasProject && activeProject !== null && (
        <PdfExportDialog
          open={pdfDialogOpen}
          project={activeProject}
          trees={trees}
          parcels={projectParcels}
          onClose={() => {
            setPdfDialogOpen(false);
          }}
        />
      )}

      <TreeListPanel
        open={listPanelOpen}
        onClose={() => {
          setListPanelOpen(false);
        }}
        trees={trees}
        onSelectTree={handleSelectTree}
        onDeleteTree={handleDeleteTree}
        onEditTree={handleEditTree}
      />

      <AddTreePanel
        gpsPosition={position}
        gpsLoading={gpsLoading}
        gpsError={gpsError}
        onRefreshGps={refresh}
      />

      <noscript className="absolute inset-0 flex items-center justify-center bg-stone-100 p-4 text-center">
        <p className="text-stone-700">Mapa wymaga włączonej obsługi JavaScript.</p>
      </noscript>
    </div>
  );
}

interface ParcelCardProps {
  parcel: Parcel;
  onClose: () => void;
  action?: ParcelPopupAction;
  onAdd?: (parcel: Parcel) => void;
  onRemove?: (teryt: string) => void;
}

function ParcelCard({ parcel, onClose, action = { kind: 'none' }, onAdd, onRemove }: ParcelCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="pointer-events-auto" data-testid="parcel-card">
      <CardHeader className="flex flex-row items-start justify-between gap-1 p-3 pb-1">
        <div className="min-w-0">
          <CardTitle className="text-sm">Wybrana działka</CardTitle>
          <p className="truncate font-mono text-xs text-stone-500">{parcel.teryt}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            data-testid="parcel-card-toggle"
            aria-expanded={expanded}
            onClick={() => {
              setExpanded((prev) => !prev);
            }}
            className="flex h-11 items-center rounded px-2 text-sm text-forest-700 hover:bg-forest-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 sm:hidden"
          >
            {expanded ? 'Mniej' : 'Szczegóły'}
          </button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Zamknij kartę działki"
            data-testid="parcel-card-close"
            onClick={onClose}
            className="h-11 w-11 px-0"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className={expanded ? 'p-3 pt-0' : 'hidden p-3 pt-0 sm:block'}>
        <ParcelPopup parcel={parcel} action={action} onAdd={onAdd} onRemove={onRemove} />
      </CardContent>
    </Card>
  );
}
