import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import StartPage from '@/pages/StartPage';
import AppPage from '@/pages/AppPage';
import ProjectsPage from '@/pages/ProjectsPage';
import NotFound from '@/pages/NotFound';

const SettingsPage = lazy(() => import('@/pages/SettingsPage'));

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
    <div className="h-full w-full">
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/app" element={<AppPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
  );
}
