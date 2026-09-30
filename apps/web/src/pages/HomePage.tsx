import { Link } from 'react-router-dom';
import { TreePine, MapPin, Camera, FileText } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

const FEATURES: readonly { icon: JSX.Element; title: string; description: string }[] = [
  {
    icon: <MapPin className="h-6 w-6 text-forest-700" />,
    title: 'Działki z EGiB',
    description: 'Kliknij na mapie, aby pobrać obręb i numer działki z bazy GUGiK.',
  },
  {
    icon: <Camera className="h-6 w-6 text-forest-700" />,
    title: 'Inwentaryzacja drzew',
    description: 'Dodawaj drzewa z obwodem, gatunkiem i dokładną lokalizacją GPS.',
  },
  {
    icon: <FileText className="h-6 w-6 text-forest-700" />,
    title: 'Raport PDF',
    description: 'Wygeneruj raport z mapą, drzewami i tabelą zbiorczą.',
  },
];

export default function HomePage(): JSX.Element {
  return (
    <div className="h-full overflow-auto bg-stone-50">
      <section className="bg-gradient-to-br from-forest-700 to-forest-900 px-6 py-12 text-white sm:py-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <TreePine aria-hidden="true" className="h-12 w-12 text-forest-300" />
          <h1 className="text-3xl font-bold sm:text-4xl">Wycinka Drzew</h1>
          <p className="max-w-xl text-base text-forest-100 sm:text-lg">
            Mobilna aplikacja do inwentaryzacji drzew na działkach leśnych. Pobieraj działki z EGiB,
            dodawaj drzewa w terenie, eksportuj raporty PDF.
          </p>
          <Link to="/map" className="mt-4">
            <Button size="lg" variant="secondary">
              Otwórz mapę
            </Button>
          </Link>
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="mb-6 text-2xl font-semibold text-forest-900">Funkcjonalności</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {feature.icon}
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-stone-600">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
