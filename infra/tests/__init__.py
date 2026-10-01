# Testy infrastruktury wycinka.app
#
# Lekkie testy walidujace konfiguracje — bez uruchamiania dockera (w CI).
# Tam gdzie mozliwe, uruchamiaja CLI (`docker compose config`, `caddy validate`)
# jesli sa dostepne w PATH.
#
# Uruchomienie:
#   python -m infra.tests
#
# Lub pojedynczo:
#   python -m infra.tests.test_compose_config
#   python -m infra.tests.test_caddyfile
#   python -m infra.tests.test_cloudflared_config
#
# Wymagania:
#   pip install pyyaml
#
# Opcjonalnie (dla testow CLI):
#   - docker + docker compose
#   - caddy

from .test_compose_config import DockerComposeConfigTest
from .test_caddyfile import CaddyfileTest
from .test_cloudflared_config import CloudflaredConfigTest

__all__ = [
	"DockerComposeConfigTest",
	"CaddyfileTest",
	"CloudflaredConfigTest",
]