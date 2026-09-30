# Cloudflare Tunnel — konfiguracja

Tunel pozwala wystawić stack `wycinka` na zewnątrz **bez otwierania portów na routerze**.
Cały ruch przychodzący na `wycinka.app` (i subdomeny) przechodzi przez sieć Cloudflare
i tuneluje do Caddy wewnątrz sieci `wycinka-net`.

## Wymagania

- Domena zarządzana przez Cloudflare (w tym przypadku `wycinka.app`)
- Konto Cloudflare z uprawnieniami do edycji DNS tej domeny
- Zainstalowany `cloudflared` lokalnie (CLI) — https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

## Jednorazowa konfiguracja (wykonywana RAZ, poza kontenerem)

### 1. Logowanie

```bash
cloudflared tunnel login
```

Przeglądarka otworzy stronę Cloudflare, wybierz domenę `wycinka.app`. Powstanie plik
`cert.pem` w `~/.cloudflared/`.

### 2. Utworzenie tunelu

```bash
cloudflared tunnel create wycinka
```

Polecenie zwróci **TUNNEL_ID** (UUID) i utworzy plik credentials w
`~/.cloudflared/<TUNNEL_ID>.json`. To jest plik, który zamontujesz w kontenerze.

### 3. Wskazanie DNS

```bash
cloudflared tunnel route dns wycinka wycinka.app
cloudflared tunnel route dns wycinka "*.wycinka.app"
```

Te komendy tworzą rekordy CNAME w Cloudflare kierujące ruch do tunelu.

### 4. Konfiguracja w repo

```bash
cd infra/cloudflared
cp config.yml.example config.yml

# Podmień <TUNNEL_ID> na UUID z kroku 2
sed -i "s/<TUNNEL_ID>/<TWÓSTNIEL_ID>/g" config.yml

# Skopiuj credentials z lokalnej maszyny
cp ~/.cloudflared/<TUNNEL_ID>.json .
```

**WAŻNE:** Plik `<TUNNEL_ID>.json` jest już w `.gitignore` (nie commituj!).

### 5. Opcja: token zamiast pliku credentials

Cloudflare wspiera „Tunnel Token" — pojedynczy ciąg, który można podać jako zmienną
środowiskową `TUNNEL_TOKEN=` zamiast pliku JSON. Wygodniejsze dla CI/CD i remote
deploy. Wygenerujesz go przez Cloudflare Dashboard lub:

```bash
cloudflared tunnel token <TUNNEL_ID>
```

Jeśli używasz tokenu, w `docker-compose.yml` zamień `command: tunnel --config ...`
na `command: tunnel --no-autoupdate run` i dodaj `environment: TUNNEL_TOKEN: ...`
(sekret przechowuj w `.env`, NIE w repo).

## Uruchomienie tunelu (z kontenerem)

```bash
cd infra
docker compose up -d cloudflared
docker compose logs -f cloudflared
```

Poprawny log startu:
```
INF Starting tunnel ...
INF Connection ... connIndex=0 connection=<id> event=0 ip=... location=...
INF Registered tunnel connection ...
```

## Weryfikacja

```bash
# Sprawdź status tunelu z CLI (używa cert.pem z kroku 1)
cloudflared tunnel info wycinka

# Test z zewnątrz
curl -I https://wycinka.app/health
```

Powinno zwrócić `200 OK` z JSON-em healthcheck z backendu (po przejściu przez Caddy).

## Bezpieczeństwo

- **Credentials** (`<TUNNEL_ID>.json` / `cert.pem`) trzymaj TYLKO lokalnie i w
  secret managerze CI. NIE commituj.
- **DNS tylko dla Twojej domeny.** W `config.yml` nie dodawaj cudzych hostname'ów.
- **W produkcji** ogranicz ingress w Cloudflare Zero Trust (Access policies) jeśli
  chcesz chronić konkretne ścieżki (np. `/api/*` za loginem Cloudflare).

## Rotacja credentials

Jeśli credentials wycieknie:

```bash
cloudflared tunnel rotate-credentials wycinka
# zaktualizuj plik JSON w infra/cloudflared/
docker compose restart cloudflared
```

Stary zestaw jest unieważniany atomowo.