# infra/ — deployment i operacje wycinka.app

Kompletna konfiguracja do uruchomienia stacka produkcyjnie i developersko.
Wszystko jest zorganizowane w `docker compose` — backend, frontend, reverse-proxy
i tunel Cloudflare.

## Szybki start (produkcja)

```bash
cd infra

# 1. Konfiguracja
cp .env.example .env
# Uzupelnij .env: DOMAIN, TUNNEL_ID

# 2. Cloudflare Tunnel (jednorazowo)
#    zobacz cloudflared/README.md

# 3. Dane runtime
DATA_DIR=./data bash scripts/init-data.sh

# 4. Start
docker compose up -d --build

# 5. Healthcheck
bash scripts/healthcheck.sh
```

## Szybki start (dev)

```bash
cd infra
docker compose -f docker-compose.dev.yml up --build
```

| Serwis | URL | Co |
|---|---|---|
| API | http://localhost:8000 | FastAPI + Uvicorn z hot reload |
| Web | http://localhost:5173 | Vite dev server z hot reload |
| PMTiles | http://localhost:8000/api/v1/pmtiles/dzialki | przez API |

`VITE_API_URL=http://localhost:8000/api/v1` jest ustawiane automatycznie.

## Struktura

```
infra/
├── docker-compose.yml          # produkcja (api, web, caddy, cloudflared)
├── docker-compose.dev.yml      # dev (hot reload)
├── .env.example                 # zmienne srodowiskowe
├── README.md                   # ten plik
│
├── caddy/                       # reverse-proxy z auto-HTTPS
│   ├── Caddyfile
│   └── Dockerfile               # multi-stage, plugin Cloudflare DNS (opcja)
│
├── nginx/                       # alternatywa dla Caddy
│   ├── nginx.conf
│   └── Dockerfile
│
├── cloudflared/                 # tunel Cloudflare
│   ├── config.yml.example
│   └── README.md                # instrukcja konfiguracji tunelu
│
├── scripts/                     # operacje
│   ├── init-data.sh             # tworzy katalogi data/
│   ├── backup.sh                # rotacyjne backupy SQLite + PMTiles
│   └── healthcheck.sh           # sprawdza caly stack
│
└── tests/                       # walidacja konfiguracji (lekka, bez dockera)
    ├── test_compose_config.py
    ├── test_caddyfile.py
    ├── test_cloudflared_config.py
    └── run.py
```

## Routing

Przez Caddy (lub Nginx) caly ruch HTTPS:

| Sciezka | Kierunek | Uwagi |
|---|---|---|
| `/health` | API | Healthcheck |
| `/api/v1/*` | API | Wszystkie endpointy + PMTiles (Range required) |
| `/*` | Web (PWA) | Frontend, service worker, assety |

## Healthcheck

Kazdy serwis (oprocz `cloudflared`) ma healthcheck:

- **api** — `httpx.get('/health')`
- **web** — `wget --spider http://localhost/`
- **caddy** — admin API na porcie 2019
- **cloudflared** — brak (tunel nie ma endpointu HTTP)

`depends_on` uzywa `condition: service_healthy`, wiec kolejny serwis czeka na
zdrowy poprzednik.

## Backup

`scripts/backup.sh` zrzuca SQLite (online backup API) + PMTiles (kopia)
do `data/backups/<timestamp>/` z retencja 7 dni. Dodaj do crona:

```cron
0 4 * * * cd /opt/wycinka/infra && DATA_DIR=/var/lib/wycinka/data bash scripts/backup.sh >> /var/log/wycinka-backup.log 2>&1
```

## Reverse proxy — Caddy vs Nginx

- **Caddy** (domyslny): auto-HTTPS, minimalna konfiguracja, pluginy
- **Nginx**: alternatywa dla zespolow z istniejaca infrastruktura Nginx,
  lub gdy potrzebujesz pelnej kontroli nad konfiguracja

Aby przelaczyc na Nginx, zamien sekcje `caddy` w `docker-compose.yml` na
odpowiednik z `nginx/`.

## Testy konfiguracji

Lekka walidacja bez uruchamiania kontenerow (dziala w CI):

```bash
cd /path/to/wycinkaApp
pip install pyyaml  # jesli brak
python -m infra.tests
```

33 testow:
- Struktura obu compose'ow (serwisy, healthcheck, restart, volumes, pinned images)
- Caddyfile (wymagane bloki, naglowki bezpieczenstwa, kompresja, flush_interval)
- cloudflared config (placeholder TUNNEL_ID, ingress rules, catchall 404)

Jesli w PATH sa `docker` i `caddy`, uruchamia rowniez ich CLI validation.

## Deployment overview

```
                    Internet
                       │
                       ▼
              ┌──────────────────┐
              │  Cloudflare Edge │  ← Cloudflare WAF, DDoS, cache
              │  (network tunnel)│
              └─────────┬────────┘
                        │ (encrypted QUIC)
                        ▼
              ┌──────────────────┐
              │   cloudflared    │  ← w kontenerze
              └─────────┬────────┘
                        │
                        ▼
              ┌──────────────────┐
              │      Caddy       │  ← TLS termination (opcjonalnie,
              │  reverse-proxy   │    bo CF juz szyfruje)
              └────┬────────┬────┘
                   │        │
            (/api) │        │ (reszta)
                   ▼        ▼
           ┌──────────┐  ┌──────────┐
           │   API    │  │   Web    │
           │ FastAPI  │  │   PWA    │
           │  :8000   │  │   :80    │
           └──────────┘  └──────────┘
                │
                ▼
           ┌──────────┐
           │  SQLite  │  ← wolumen api-data
           │ R-tree   │
           │ PMTiles  │
           └──────────┘
```

## Troubleshooting

| Objaw | Przyczyna | Rozwiazanie |
|---|---|---|
| PMTiles nie laduje sie w przegladarce | Range requests nie dzialaja | Sprawdz `Accept-Ranges: bytes` w odpowiedzi |
| Caddy zwraca 502 | API nie zdazylo wstac | Czeka na `service_healthy`, ale moze byc za szybki timeout |
| Cloudflared: connection refused | Tunel nie jest skonfigurowany | Patrz `cloudflared/README.md` |
| Port 80/443 zajety | Inny serwer (nginx/apache) | Zatrzymaj go lub zmienj w compose |
| `data/` nie istnieje | Pierwszy deploy | `bash scripts/init-data.sh` |

Wiecej w `cloudflared/README.md` (tunel) i `PLAN.md §10` (architektura).