import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import Header from '@/components/layout/Header';
import HomePage from '@/pages/HomePage';
import NotFound from '@/pages/NotFound';
import ProjectsPage from '@/pages/ProjectsPage';

const MapPage = lazy(() => import('@/pages/MapPage'));

function PageFallback(): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center bg-stone-50">
      <span
        aria-hidden="true"
        className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-forest-500 border-t-transparent"
      />
      <span className="sr-only">Ładowanie…</span>
    </div>
  );
}

export default function App(): JSX.Element {
  return (
    <div className="flex h-full w-full flex-col">
      <Header />
      <main className="relative flex-1 overflow-hidden">
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
