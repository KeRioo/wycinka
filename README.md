# wycinka.app

Mobilna PWA do inwentaryzacji drzew na działkach leśnych. Self-hosted, z własnym backendem hostującym dane EGiB.

> Status: **w budowie** — szczegóły architektury w [PLAN.md](./PLAN.md).

## Quick start (dla developerów)

```bash
# 1. Backend (FastAPI)
cd apps/api && docker build -t wycinka-api . && docker run -p 8000:8000 wycinka-api

# 2. Frontend (Vite/React)
cd apps/web && npm install && npm run dev

# 3. Całość razem (Docker Compose)
docker compose -f infra/docker-compose.dev.yml up
```

Zobacz:
- [PLAN.md](./PLAN.md) — architektura, funkcjonalności, harmonogram
- [AGENTS.md](./AGENTS.md) — instrukcje dla subagentów budujących projekt
- [docs/api-contract.md](./docs/api-contract.md) — kontrakt API między frontendem a backendem

## Stack

**Frontend:** Vite + React 18 + TypeScript + Tailwind + MapLibre GL JS + Dexie (PWA)
**Backend:** FastAPI + SQLite/R-tree + PMTiles (Python)
**Data:** EGiB z geoportal.gov.pl (PMTiles, sync co tydzień)
**Infra:** Docker Compose + Cloudflare Tunnel

## Licencja danych

Dane EGiB: otwarte dane publiczne (GUGiK). Wymagana atrybucja: „Dane: Główny Urząd Geodezji i Kartografii oraz Starosta [powiat]".
