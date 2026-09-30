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

---

## ETL (subagent: etl)

Branch: `feat/etl-scaffold`

- [x] `egib_sync/__init__.py` + `egib_sync/config.py` — Pydantic Settings, env override (`EGIB_*`)
- [x] `egib_sync/logging.py` — structlog (JSON production, pretty dev), idempotent
- [x] `egib_sync/retry.py` — exponential backoff helper (testowane property-based)
- [x] `egib_sync/downloader.py` — powiat list download + concurrent GPKG download (respx mockowane)
- [x] `egib_sync/merger.py` — atomic merge do `merged.gpkg`, walidacja schematu
- [x] `egib_sync/pmtiles_gen.py` — wrapper `tippecanoe` z timeout i error classification
- [x] `egib_sync/sqlite_loader.py` — import do SQLite z R-tree i `sync_meta`
- [x] `egib_sync/pipeline.py` — orchestracja 4 etapów z atomicity i rollback
- [x] `egib_sync/__main__.py` — CLI entrypoint: `--powiat`, `--skip-*`, `--dry-run`, `--report`
- [x] `tests/test_cli.py` — 11 testów CLI (help, dry-run, report, log level, exit codes 0/1/2/130)
- [x] `README.md` — quickstart, stages, atomicity, troubleshooting
- [x] `.gitignore` — `coverage.xml` zignorowany globalnie

**Pinned wersje:** python 3.12, pytest 9.x, pydantic-settings, structlog, respx, hypothesis
**CLI exit codes:** 0 = sukces, 1 = wyjątek, 2 = częściowy sukces, 130 = Ctrl+C
**Coverage `__main__.py`:** 97% (58 stmts, 2 miss: linie niedostępne w argparse help flow)
**Wszystkie testy:** 143 zielone (132 istniejące + 11 nowych CLI)

DoD:
- [x] Każdy moduł ETL ma testy (132 przed CLI; 143 po CLI)
- [x] Atomicity: każdy etap pisze do `.tmp`, rename po sukcesie, restore z backupu przy błędzie
- [x] Rollback: `data/backups/{timestamp}/` zachowuje poprzednią wersję każdego artifactu
- [x] Retencja: starych backupów czyszczonych do `RETENTION__BACKUPS_KEEP=2`
- [x] CLI: argparse, brak dodatkowych zależności runtime
- [x] Dry-run: nie pisze plików, waliduje konfigurację
- [x] README: quickstart + troubleshooting (tippecanoe, timeout, disk space)
- [x] STATUS.md zaktualizowany

**Znalezione problemy / uwagi dla innych agentów:**

1. **`get_settings()` nie akceptuje kwargs** — CLI buduje `Settings(**overrides)` bezpośrednio (nie modyfikowałem sygnatury, żeby nie zmieniać kontraktu).
2. **`PipelineResult`:** `started_at`/`finished_at` to `datetime`, `success` to property (`not self.errors`), brak pola `elapsed_seconds` — liczone w runtime jako `finished - started`.
3. **Coverage:** `coverage.xml` musi być w root `.gitignore` (reguła `coverage/` łapie tylko katalogi).
4. **Atomicity jest implementowana w `_run_*` helperach** w `pipeline.py` — każdy etap ma wzorzec: `backup_existing()` → `ensure_dirs()` → właściwa praca → `rename(.tmp → final)`. Wyjątek w trakcie pracy triggeruje `_fail_with_partial()` który przywraca z backupu.
