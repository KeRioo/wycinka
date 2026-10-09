#!/bin/sh
# Entrypoint Caddy — renderuje Caddyfile z wyborem snippetów wg APP_ENV.
#
# Dlaczego sed a nie substytucja {$VAR} w Caddyfile: parser Caddy rozwija
# `import` PRZED substytucją zmiennych środowiskowych, więc
# `import {$APP_ENV:production}_cors` nie działa — env w nazwie importu
# musimy rozwinąć my, przy starcie kontenera.
#
# - {$DOMAIN}, {$FRONTEND_ORIGIN}, {$AUTH_PASSWORD_HASH} zostaje dla Caddy
#   (substytucja środowiskowa działa w zwykłych tokenach).
set -eu

APP_ENV="${APP_ENV:-production}"

case "$APP_ENV" in
	production|development) ;;
	*)
		echo "entrypoint: APP_ENV musi byc 'production' albo 'development', jest: '${APP_ENV}'" >&2
		exit 1
		;;
esac

sed -e "s/{\$APP_ENV:production}_cors/cors_${APP_ENV}/" \
	-e "s/{\$APP_ENV:production}_auth/auth_${APP_ENV}/" \
	/etc/caddy/Caddyfile > /tmp/Caddyfile.rendered

exec caddy "$@"
