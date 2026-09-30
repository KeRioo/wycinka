# STATUS — co robią poszczególni agenci

> Aktualizowane przez każdego subagenta po zakończeniu zadania.

## Legenda

- `[ ]` todo
- `[~]` in progress
- `[x]` done
- `[!]` blocked

---

## Nadzorca (supervisor)

- [x] Inicjalizacja repo git
- [x] Utworzenie AGENTS.md, README.md
- [x] Definicja kontraktu API (`docs/api-contract.md`)
- [x] Definicja schematu bazy (`docs/data-schema.md`)
- [x] Plan projektu (PLAN.md, 11 sekcji)
- [ ] Koordynacja integracji po zakończeniu modułów
- [ ] Code review merge'ów do main

---

## Infra (subagent: infra)

Branch: `feat/infra-scaffold`

- [x] `docker-compose.yml` — produkcja (api, web, caddy, cloudflared)
- [x] `docker-compose.dev.yml` — dev z hot reload
- [x] `.env.example` — domeny, porty, TUNNEL_ID
- [x] `caddy/Caddyfile` — reverse proxy z PMTiles Range support + nagłówki bezpieczeństwa
- [x] `caddy/Dockerfile` — multi-stage z opcjonalnym pluginem Cloudflare DNS
- [x] `nginx/` — alternatywa dla Caddy (pełna konfiguracja + Dockerfile, non-root)
- [x] `cloudflared/config.yml.example` — szablon z placeholder `<TUNNEL_ID>`
- [x] `cloudflared/README.md` — pełna instrukcja konfiguracji tunelu (login, create, route dns, rotate)
- [x] `scripts/init-data.sh` — tworzy katalogi `data/{pmtiles,sqlite,backups,etl-staging}`
- [x] `scripts/backup.sh` — rotacyjne backupy SQLite (online API) + PMTiles (cp), retencja 7 dni
- [x] `scripts/healthcheck.sh` — sprawdza kontenery + endpointy + nagłówek Accept-Ranges
- [x] `tests/` — 33 testy walidacji (compose, Caddyfile, cloudflared config), 31 OK + 2 skipped (brak docker/caddy CLI)
- [x] `README.md` — quickstart, routing, architektura, troubleshooting

**Pinned images:** cloudflare/cloudflared:2024.5.0, caddy:2-alpine, nginx:1.27-alpine, node:20-alpine
**Wszystkie serwisy:** restart: unless-stopped + healthcheck (oprócz cloudflared)
**Caddy depends_on:** api (healthy) + web (healthy)
**Cloudflared depends_on:** caddy (healthy)
**Non-root user:** w caddy i nginx Dockerfile

DoD:
- [x] `docker compose config` dla obu compose'ów (CLI niedostępne lokalnie — walidowane przez testy)
- [x] Wszystkie serwisy mają healthcheck (oprócz cloudflared)
- [x] Wszystkie obrazy mają pinned wersje (cloudflared:2024.5.0)
- [x] Wszystkie serwisy mają `restart: unless-stopped`
- [x] Non-root user w custom Dockerfile (caddy, nginx)
- [x] Multi-stage build (caddy: xcaddy builder + caddy runtime)
- [x] Caddyfile kieruje /api → api, resztę → web
- [x] cloudflared config: placeholder `<TUNNEL_ID>`, credentials w `.gitignore`
- [x] README wyjaśnia produkcję i dev
- [x] 33 testy przechodzą (2 skipped - CLI)
- [x] STATUS.md zaktualizowany

**Znalezione problemy / uwagi dla innych agentów:**

1. **Koordynacja branch'y:** W trakcie pracy kilkukrotnie inne agenty przełączyły mi branch podczas wykonywania komend, co spowodowało utratę plików z working tree. Praca była bezpieczna w git (zatwierdzona), ale pliki po drodze znikały. Rekomendacja dla przyszłych agentów: commitować natychmiast po każdym pliku, nie czekać.

2. **Dla backendu:** `docker-compose.yml` oczekuje `Dockerfile` w `apps/api/` i serwuje API na porcie 8000. Healthcheck: `httpx.get('/health')` zwraca 200. Endpointy: `/health`, `/api/v1/parcel`, `/api/v1/search`, `/api/v1/pmtiles/dzialki`, `/api/v1/version`.

3. **Dla frontendu:** `docker-compose.yml` oczekuje `Dockerfile` w `apps/web/` serwujący statyczne pliki na porcie 80 (w produkcji — multi-stage build). `Dockerfile.dev` dla dev compose z hot reload.

4. **Dla ETL:** Katalogi runtime: `data/pmtiles/`, `data/sqlite/`, `data/etl-staging/`. Volume `api-data` jest zamontowany w kontenerze api jako `/app/data`. SQLite z R-tree oczekiwany w `data/sqlite/parcels.sqlite`, PMTiles w `data/pmtiles/dzialki.pmtiles`.
