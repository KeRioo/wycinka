# Runtime obraz PWA (wycinka-web) — infra copy of apps/web/Dockerfile.
#
# Dlaczego duplikat: apps/web/.dockerignore wyklucza nginx.conf z kontekstu
# build apps/web, więc oryginalny `COPY nginx.conf` nie może się zbudować.
# Tu COPY bierze nginx.conf z kontekstu `infra` (compose additional_contexts)
# — kopia pliku z apps/web/nginx.conf w infra/web/nginx.conf.
# TODO(coordinate): frontend ma naprawić .dockerignore albo backlink do
# tej wersji; do głoszenia w coordination/REQUESTS.md.
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts vitest.config.ts tailwind.config.ts postcss.config.js eslint.config.js .prettierrc.json index.html ./
COPY src ./src
COPY tests ./tests
COPY public ./public

# Prod PWA: relatywny API base (same-origin za Caddy, wspólnie z basic auth).
# Dev nadpisuje przez compose arg VITE_API_URL (localhost:8000), docker.dev.
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache wget && \
    rm -f /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=infra infra/web/nginx.conf /etc/nginx/conf.d/default.conf

RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html && \
    mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp \
             /var/cache/nginx/fastcgi_temp /var/cache/nginx/uwsgi_temp \
             /var/cache/nginx/scgi_temp /var/run/nginx \
    && chown -R nginx:nginx /var/cache/nginx /var/run/nginx

USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://localhost/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
