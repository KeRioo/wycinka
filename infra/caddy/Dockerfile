# Multi-stage build Caddy z pluginem Cloudflare DNS (opcjonalny)
# Plugin przydatny gdybyśmy kiedyś chcieli automatyczne certyfikaty Let's Encrypt
# z użyciem tokenu Cloudflare zamiast DNS challenge przez tunnel.

FROM golang:1.22-alpine AS builder
RUN apk add --no-cache git ca-certificates
RUN go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
RUN xcaddy build \
	--with github.com/caddy-dns/cloudflare \
	--output /usr/bin/caddy

FROM caddy:2-alpine
RUN apk add --no-cache ca-certificates
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
# Render Caddyfile wg APP_ENV (patrz entrypoint.sh) — CORS/auth wybierane w runtime
COPY --chmod=755 entrypoint.sh /usr/local/bin/entrypoint.sh
USER caddy
EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
	CMD wget -q --spider http://localhost:2019/config/ || exit 1
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["run", "--config", "/tmp/Caddyfile.rendered", "--adapter", "caddyfile"]
