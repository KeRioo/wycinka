# Testy infrastruktury
#
# Lekka walidacja konfiguracji bez uruchamiania kontenerów.
#
# Uruchomienie:
#   python -m infra.tests
#
# Lub pojedynczo:
#   python infra/tests/test_compose_config.py
#   python infra/tests/test_caddyfile.py
#   python infra/tests/test_cloudflared_config.py
#
# Pokrycie:
# - docker-compose.yml / docker-compose.dev.yml — struktura + (opcjonalnie) CLI
# - Caddyfile — bloki, nagłówki, kompresja, streaming
# - cloudflared/config.yml.example — wymagane pola, placeholder, ingress

import sys
import unittest
from pathlib import Path

if __name__ == "__main__":
	sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
	from infra.tests.test_compose_config import DockerComposeConfigTest
	from infra.tests.test_caddyfile import CaddyfileTest
	from infra.tests.test_cloudflared_config import CloudflaredConfigTest

	loader = unittest.TestLoader()
	suite = unittest.TestSuite()
	suite.addTests(loader.loadTestsFromTestCase(DockerComposeConfigTest))
	suite.addTests(loader.loadTestsFromTestCase(CaddyfileTest))
	suite.addTests(loader.loadTestsFromTestCase(CloudflaredConfigTest))
	from infra.tests.test_etl_config import (
		EtlDockerfileTest,
		EtlRunbookTest,
		EtlScriptsTest,
	)
	suite.addTests(loader.loadTestsFromTestCase(EtlScriptsTest))
	suite.addTests(loader.loadTestsFromTestCase(EtlDockerfileTest))
	suite.addTests(loader.loadTestsFromTestCase(EtlRunbookTest))

	runner = unittest.TextTestRunner(verbosity=2)
	result = runner.run(suite)
	sys.exit(0 if result.wasSuccessful() else 1)