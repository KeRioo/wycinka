import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import MapPage from '@/pages/MapPage';
import Header from '@/components/layout/Header';
import { ensureProjectsLoaded, useProjectStore } from '@/stores/projectStore';

export default function AppPage(): JSX.Element {
  const navigate = useNavigate();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projectsCount = useProjectStore((s) => s.projects.length);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const ensure = async (): Promise<void> => {
      await ensureProjectsLoaded();
      if (cancelled) {
        return;
      }
      const state = useProjectStore.getState();
      if (state.status === 'error' || state.projects.length === 0) {
        navigate('/', { replace: true });
        return;
      }
      setChecking(false);
    };
    void ensure();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (checking) {
    return (
      <div data-testid="app-loading" className="flex h-full items-center justify-center bg-stone-50">
        <span
          aria-hidden="true"
          className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-forest-500 border-t-transparent"
        />
        <span className="sr-only">Ładowanie…</span>
      </div>
    );
  }

  if (projectsCount === 0 || activeProjectId === null) {
    return <Navigate to="/" replace />;
  }

  return (
    <div data-testid="app-page" className="flex h-full w-full flex-col">
      <Header />
      <main className="relative min-h-0 flex-1">
        <MapPage />
      </main>
    </div>
  );
}
