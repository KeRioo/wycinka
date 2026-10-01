# Wycinka — Frontend (PWA)

Mobilna aplikacja PWA do inwentaryzacji drzew na działkach leśnych w Polsce.

## Stack

- Vite 5 + React 18 + TypeScript 5 (strict)
- Tailwind CSS 3 (motyw leśny)
- React Router v6
- Zustand (globalny stan)
- MapLibre GL JS + `pmtiles` (warstwa działek EGiB)
- Dexie.js (IndexedDB) — projekty i drzewa
- ky (HTTP klient)
- vite-plugin-pwa (Workbox)
- Vitest + Testing Library + MSW (testy jednostkowe)
- Playwright (E2E)

## Wymagania

- Node.js ≥ 20
- npm ≥ 10

## Instalacja

```bash
npm ci
cp .env.example .env  # opcjonalnie — skonfiguruj URL backendu
```

## Skrypty

| Skrypt | Opis |
|---|---|
| `npm run dev` | Serwer developerski (Vite) na `http://localhost:5173` |
| `npm run build` | Build produkcyjny do `dist/` |
| `npm run preview` | Podgląd buildu produkcyjnego |
| `npm run typecheck` | TypeScript strict check |
| `npm run lint` | ESLint (max 0 ostrzeżeń) |
| `npm run format` | Prettier |
| `npm run test` | Testy jednostkowe (Vitest) |
| `npm run test:coverage` | Testy + raport pokrycia |
| `npm run test:e2e` | Testy E2E (Playwright) |
| `npm run test:e2e:ui` | Playwright UI mode |

## Zmienne środowiskowe

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000/api/v1` | Bazowy URL API backendu |
| `VITE_PMTILES_URL` | `${VITE_API_URL}/pmtiles/dzialki` | URL pliku PMTiles z działkami |

## Struktura

```
src/
├── components/
│   ├── ui/          # Button, Card, Input (shadcn-like)
│   ├── layout/      # Header
│   └── map/         # MapView, usePMTiles, MapClickHandler, ParcelPopup
├── pages/           # HomePage, MapPage, NotFound
├── services/        # api.ts, api.types.ts
├── stores/          # zustand stores
├── db/              # Dexie schema, migracje
├── hooks/           # useGeolocation, useAPI
├── lib/             # utils (cn, debounce, formatters)
└── test/            # MSW server, setup, fixtures
```

## Testy

- **Unit (Vitest):** `tests/unit/**`
  - `api.test.ts` — pokrycie każdej metody API (happy + 2 scenariusze błędne)
  - `db.test.ts` — Dexie schema, CRUD, kaskadowe usuwanie
  - `usePMTiles.test.ts` — rejestracja/cleanup protokołu PMTiles
  - `useGeolocation.test.ts` — geolokalizacja z mockiem `navigator.geolocation`
  - `useAPI.test.ts` — hook wyszukiwania działki
  - `HomePage.test.tsx`, `App.test.tsx` — komponenty i routing
  - `utils.test.ts`, `api.types.test.ts` — czyste funkcje
- **E2E (Playwright):** `tests/e2e/**`
  - `map.spec.ts` — nawigacja, render mapy
  - `navigation.spec.ts` — flow strona główna → mapa

Mockowane odpowiedzi API w `src/test/mocks/`.

## Konwencje

Zobacz [`AGENTS.md`](../../AGENTS.md) i [`docs/api-contract.md`](../../docs/api-contract.md).

## Docker

```bash
docker build -t wycinka-web --build-arg VITE_API_URL=https://twoja-domena.pl/api/v1 .
docker run --rm -p 8080:80 wycinka-web
```

## Komunikacja z backendem

Frontend konsumuje kontrakt API zdefiniowany w `docs/api-contract.md`. Zmiany kontraktu wymagają koordynacji z agentem backendu.
