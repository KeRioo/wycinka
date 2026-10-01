import { Route, Routes } from 'react-router-dom';
import Header from '@/components/layout/Header';
import HomePage from '@/pages/HomePage';
import MapPage from '@/pages/MapPage';
import NotFound from '@/pages/NotFound';
import ProjectsPage from '@/pages/ProjectsPage';

export default function App(): JSX.Element {
  return (
    <div className="flex h-full w-full flex-col">
      <Header />
      <main className="relative flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
