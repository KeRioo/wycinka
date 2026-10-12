import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, LogOut, Menu, Settings, TreePine } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';

export default function Header(): JSX.Element {
  const navigate = useNavigate();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projects = useProjectStore((s) => s.projects);
  const openAppModal = useAppStore((s) => s.openAppModal);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const activeProject =
    activeProjectId !== null ? (projects.find((p) => p.id === activeProjectId) ?? null) : null;

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent): void => {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const handleExit = (): void => {
    setMenuOpen(false);
    navigate('/');
  };

  return (
    <header
      data-testid="app-header"
      className="z-30 shrink-0 bg-forest-700 px-3 text-white shadow-md sm:px-4"
    >
      <div className="flex h-14 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex items-center gap-2 font-semibold">
            <TreePine aria-hidden="true" className="h-6 w-6 shrink-0" />
            <span className="hidden text-base sm:inline">Wycinka Drzew</span>
          </span>
          {activeProject !== null && (
            <span
              data-testid="project-chip"
              title={activeProject.name}
              className="max-w-[10rem] truncate rounded-full bg-forest-900/60 px-3 py-1 text-xs font-medium text-forest-50 sm:max-w-[18rem] sm:text-sm"
            >
              {activeProject.name}
            </span>
          )}
        </div>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Menu aplikacji"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            data-testid="app-menu"
            onClick={() => {
              setMenuOpen((prev) => !prev);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-md transition-colors hover:bg-forest-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-300"
          >
            <Menu aria-hidden="true" className="h-6 w-6" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              aria-label="Menu aplikacji"
              data-testid="app-menu-panel"
              className="absolute right-0 top-12 w-56 overflow-hidden rounded-xl border border-stone-200 bg-white text-stone-800 shadow-xl"
            >
              <button
                type="button"
                role="menuitem"
                data-testid="menu-settings"
                onClick={() => {
                  setMenuOpen(false);
                  openAppModal('settings');
                }}
                className={cn(
                  'flex h-11 w-full items-center gap-3 px-4 text-left text-sm font-medium',
                  'hover:bg-forest-50 focus-visible:bg-forest-50 focus-visible:outline-none',
                )}
              >
                <Settings aria-hidden="true" className="h-4 w-4 text-forest-700" />
                Ustawienia
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="menu-reports"
                onClick={() => {
                  setMenuOpen(false);
                  openAppModal('reports');
                }}
                className={cn(
                  'flex h-11 w-full items-center gap-3 px-4 text-left text-sm font-medium',
                  'hover:bg-forest-50 focus-visible:bg-forest-50 focus-visible:outline-none',
                )}
              >
                <FileText aria-hidden="true" className="h-4 w-4 text-forest-700" />
                Raporty
              </button>
              <div className="border-t border-stone-200" />
              <button
                type="button"
                role="menuitem"
                data-testid="menu-exit"
                onClick={handleExit}
                className={cn(
                  'flex h-11 w-full items-center gap-3 px-4 text-left text-sm font-medium',
                  'hover:bg-stone-100 focus-visible:bg-stone-100 focus-visible:outline-none',
                )}
              >
                <LogOut aria-hidden="true" className="h-4 w-4 text-stone-500" />
                Wyjdź do startu
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
