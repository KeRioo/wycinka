import { Link, useLocation } from 'react-router-dom';
import { TreePine } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchBox from '@/components/layout/SearchBox';

interface NavItem {
  to: string;
  label: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Start' },
  { to: '/map', label: 'Mapa' },
  { to: '/projects', label: 'Projekty' },
  { to: '/settings', label: 'Ustawienia' },
];

export default function Header(): JSX.Element {
  const location = useLocation();

  return (
    <header className="z-10 shrink-0 border-b border-forest-700 bg-forest-700 px-4 text-white shadow-md">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-1 sm:flex-nowrap sm:py-0">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <TreePine aria-hidden="true" className="h-6 w-6" />
          <span className="text-base">Wycinka Drzew</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-forest-900 text-white' : 'text-forest-100 hover:bg-forest-800',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="order-last w-full pb-1 sm:order-none sm:w-auto sm:basis-auto sm:pb-0">
          <SearchBox />
        </div>
      </div>
    </header>
  );
}
