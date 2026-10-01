import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';

export default function NotFound(): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center bg-stone-50 p-6">
      <div className="max-w-md space-y-4 text-center">
        <p className="text-6xl font-bold text-forest-700">404</p>
        <h1 className="text-2xl font-semibold text-forest-900">Nie znaleziono strony</h1>
        <p className="text-stone-600">Strona, której szukasz, nie istnieje lub została przeniesiona.</p>
        <Link to="/">
          <Button>Wróć na stronę główną</Button>
        </Link>
      </div>
    </div>
  );
}
