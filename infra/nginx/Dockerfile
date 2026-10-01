# Nginx 1.27 alpine — multi-stage, non-root, healthcheck
FROM nginx:1.27-alpine AS runtime

# Healthcheck używa wget (wbudowany w alpine)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
	CMD wget -q --spider http://localhost/ || exit 1

COPY nginx.conf /etc/nginx/nginx.conf

# Non-root: przełącz na użytkownika nginx (już istnieje w bazowym obrazie)
USER nginx

EXPOSE 80 443