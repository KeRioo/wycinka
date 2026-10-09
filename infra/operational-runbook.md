# operational-runbook.md — wycinka.app dla operatora

Instrukcja operacyjna całego stacku: deploy, ETL cron-container, tunel,
monitoring, backupy i awarie. Dotyczy `infra/` w tym repo (docker compose).

## Stack i przepływ danych

```
cloudflared -> caddy -> api (FastAPI) -> api-data volume (SQLite + PMTiles)
etl (cron-container) ---------------------------------> api-data volume (pisze sqlite/pmtiles)
```

Serwis **etl** uruchamia `python -m egib_sync` w pętli (sleep-based scheduler,
domyślnie co `ETL_INTERVAL_SECONDS=86400` s), pisząc SQLite/PMTiles do tego
samego wolumenu `api-data`, z którego czyta API. Kontener etl siedzi w sieci
`etl-net` — ma dostęp wychodzący do GUGIK/geoporta (dlatego sieć nie jest
`internal`), ale jest odizolowany od caddy/web/api.

## Deployment (step by step)

1. Na serwerze zainstaluj docker + compose plugin.
2. Sklonuj repo, uzupełnij env:

   ```bash
   cp infra/.env.example infra/.env
   # Ustaw: DOMAIN, TUNNEL_ID (opcjonalnie IMAGE_TAG, ETL_INTERVAL_SECONDS)
   ```

3. Skonfiguruj tunel — skopiuj `infra/cloudflared/config.yml.example` do
   `config.yml` i uzupełnij TUNNEL_ID wires (patrz `infra/cloudflared/README.md`).
4. Przygotuj katalog danych:

   ```bash
   cd infra && DATA_DIR=./data bash scripts/init-data.sh
   ```

5. Build + start

   ```bash
   docker compose -f docker-compose.yml build
   docker compose -f docker-compose.yml up -d
   ```

6. Weryfikacja healthchecków

   ```bash
   bash scripts/healthcheck.sh
   docker compose ps        # wszystkie serwisu healthy, w tym etl
   ```

7. Weryfikacja ETL (marker last-success pojawia się po pierwszym udanym sync):

   ```bash
   docker compose exec etl cat /app/data/.sync-ops/last-success
   docker compose logs --tail 100 etl | grep -E 'pipeline_finished'
   ```

8. Finał: sprawdź `/health` i `/api/v1/version` przez Caddy, oraz czy
   PMTiles w przeglądarce renderuje (wymaga `Accept-Ranges: bytes`).

## Rollback

Obrazy są tagowane zmienną `IMAGE_TAG` — rollback to restart starym tagiem:

```bash
docker compose -f docker-compose.yml down
IMAGE_TAG=<poprzedni-dobry-tag> docker compose -f docker-compose.yml up -d
```

Gdy błąd siedzi w danych (po nieudanym sync), przywróć backup (sekcja
Backup/Restore) i restart API:

```bash
docker compose restart api
```

Wersja tippecanoe jest pinwowana `ARG TIPPECANOE_VERSION` w `infra/etl/Dockerfile`;
gdy upgrade narzędzia zepsuł pipeline — cofnij pin, zbuduj i podmień tylko etl:

```bash
docker compose build etl && docker compose up -d etl
```

## Monitoring

- **Healthchecki (compose):**
  - `api`: GET /health (httpx)
  - `web`: wget --spider
  - `caddy`: admin API na porcie 2019
  - `etl`: marker `data/.sync-ops/last-success` — unhealthy gdy marker
    starszy niż 2×ETL_INTERVAL_SECONDS
  - `cloudflared`: brak endpointu HTTP — monitoruj logi
- **Zasugerowany host-cron** (kontrola co 15 min):

  ```cron
  */15 * * * * cd /opt/wycinka/infra && bash scripts/healthcheck.sh >> /var/log/wycinka-health.log 2>&1
  ```

- **Logi:**
  - `docker compose logs -f [api|web|caddy|cloudflared|etl]`
  - JSON logging w etl — grep `pipeline_finished` / `pipeline_failed`
  - Raport sync: `docker compose exec etl sh -c 'ls /app/data/.sync-ops/'`,
    potem `cat` ostatniego `last-report-*.json` (JSON: parcels_count, errors).

## Troubleshooting

### Tunel padł (domena 530/502 albo brak odpowiedzi)

```bash
docker compose logs --tail 200 cloudflared
docker compose restart cloudflared
```

Jeśli się powtarza: sprawdź `cloudflared/config.yml` (TUNNEL_ID, credentials),
status tunelu w dashboardzie Cloudflare i stan caddy.

### Disk full → ETL fail

Objaw: log etl z `No space left on device` (ENOSPC).

```bash
df -h
docker compose exec etl du -sh /app/data/*
docker system df && docker system prune -f
```

Miejsce zajmują surowe GPKG w `data/egib-raw` i backupy — pipeline pobiera
surowce ponownie, więc można je usuwać. Po zwolnieniu miejsca:

```bash
docker compose restart etl
# albo sync od razu:
docker compose run --rm etl /usr/local/bin/run-sync.sh
```

### PMTiles corrupt (przeglądarka nie renderuje, tile-lookup fail)

```bash
docker compose exec etl ls -la /app/data/pmtiles
docker compose exec etl tippecanoe-decode /app/data/pmtiles/dzialki.pmtiles | head -c 300
```

Fix: restore z backupu (niżej) albo regeneracja PMTiles z istniejących danych:

```bash
docker compose run --rm etl /usr/local/bin/run-sync.sh --skip-download --skip-merge --skip-sqlite
```

### etl unhealthy i nie wraca

```bash
docker compose logs --tail 200 etl | grep -E 'pipeline_failed|exit'
docker compose exec etl ls -la /app/data/.sync-ops    # timestamp last-failure
```

Najczęstsze przyczyny: brak internetu w sieci `etl-net` (reguły firewalla),
transformacje geoportal (inspekcja `last-report-*.json`), tippecanoe OOM
przy dużych powiatach (ogranicz scope: uruchamiaj `run-sync.sh --powiat <teryt>`).

## Backup / restore

Backup przez `infra/scripts/backup.sh`: SQLite zrzut online-backup API,
kopia PMTiles, retencja 7 dni w `data/backups/<timestamp>/`.

```bash
cd infra && DATA_DIR=/var/lib/wycinka/data bash scripts/backup.sh
```

Host-cron (doba, 4:00):

```cron
0 4 * * * cd /opt/wycinka/infra && DATA_DIR=/var/lib/wycinka/data bash scripts/backup.sh >> /var/log/wycinka-backup.log 2>&1
```

### Restore

1. `docker compose down` — api nie może trzymać lokady na SQLite.
2. Skopiuj backup do wolumenu danych:

   ```bash
   cp data/backups/<ts>/parcels.sqlite  /var/lib/wycinka/data/sqlite/
   cp data/backups/<ts>/dzialki.pmtiles /var/lib/wycinka/data/pmtiles/
   ```

3. `docker compose up -d` + `bash scripts/healthcheck.sh` + weryfikacja
   wersji (`/api/v1/version`) i renderowania PMTiles.
