# Walidacja Caddyfile — strukturalna (bez uruchamiania caddy CLI).
#
# Sprawdzamy:
# - obecnosc wymaganych blokow (reverse_proxy api:8000, web:80, /api/*)
# - naglowki bezpieczenstwa
# - kompresje
# - flush_interval -1 (wazne dla PMTiles)
#
# Opcjonalnie (gdy `caddy` jest w PATH): `caddy validate --adapter file --config Caddyfile`

from __future__ import annotations

import re
import shutil
import subprocess
import unittest
from pathlib import Path

INFRA_ROOT = Path(__file__).resolve().parent.parent
CADDYFILE = INFRA_ROOT / "caddy" / "Caddyfile"


class CaddyfileTest(unittest.TestCase):
	def setUp(self) -> None:
		if not CADDYFILE.exists():
			self.skipTest(f"Brak pliku {CADDYFILE}")
		self.content = CADDYFILE.read_text(encoding="utf-8")

	def test_required_blocks_present(self) -> None:
		required = [
			"reverse_proxy api:8000",
			"reverse_proxy web:80",
			"handle /api/*",
			"handle /health*",
		]
		for needle in required:
			with self.subTest(needle=needle):
				self.assertIn(
					needle,
					self.content,
					f"Brak wymaganego bloku: {needle}",
				)

	def test_security_headers_present(self) -> None:
		required = [
			"Strict-Transport-Security",
			"X-Frame-Options",
			"X-Content-Type-Options",
			"Referrer-Policy",
		]
		for header in required:
			with self.subTest(header=header):
				self.assertIn(header, self.content, f"Brak naglowka: {header}")

	def test_cors_present(self) -> None:
		self.assertIn("Access-Control-Allow-Origin", self.content)
		self.assertIn("Access-Control-Allow-Methods", self.content)

	def test_compression_enabled(self) -> None:
		self.assertRegex(
			self.content,
			r"encode\s+(gzip|zstd)",
			"Kompresja musi byc wlaczona",
		)

	def test_pmtiles_streaming(self) -> None:
		# flush_interval -1 jest krytyczny dla duzych plikow PMTiles
		self.assertIn(
			"flush_interval -1",
			self.content,
			"Brak flush_interval -1 — PMTiles nie bedzie streamowane poprawnie",
		)

	def test_health_endpoint_routes_to_api(self) -> None:
		# handle /health musi wskazywac na api:8000
		idx = self.content.find("handle /health*")
		self.assertNotEqual(idx, -1, "Brak handlera /health*")
		end = self.content.find("\n}\n", idx)
		block = self.content[idx : end if end != -1 else len(self.content)]
		self.assertIn(
			"api:8000",
			block,
			"/health* powinien reverse_proxy do api:8000",
		)

	def test_api_block_routes_to_api(self) -> None:
		idx = self.content.find("handle /api/*")
		self.assertNotEqual(idx, -1, "Brak handlera /api/*")
		end = self.content.find("\n}\n", idx)
		block = self.content[idx : end if end != -1 else len(self.content)]
		self.assertIn("api:8000", block)
		# Range support — Host naglowek musi byc zachowany
		self.assertIn("Host {host}", block)

	def test_catchall_routes_to_web(self) -> None:
		# Blok 'handle' bez sciezki (catchall) powinien byc na web
		self.assertIn("handle {", self.content)
		# Powinien zawierac reverse_proxy web:80 (z DOTALL bo blok wielolinijkowy)
		self.assertIsNotNone(
			re.search(r"handle\s*\{[^}]*reverse_proxy\s+web:80", self.content, re.DOTALL),
			"Catchall handle powinien kierowac do web:80",
		)

	@unittest.skipUnless(shutil.which("caddy"), "caddy CLI niedostepny")
	def test_caddy_validate_cli(self) -> None:
		"""Opcjonalna walidacja `caddy validate` gdy CLI jest dostepne."""
		result = subprocess.run(
			["caddy", "validate", "--adapter", "file", "--config", str(CADDYFILE)],
			capture_output=True,
			text=True,
			timeout=10,
			env={"DOMAIN": "localhost.test", "PATH": "/usr/bin:/usr/local/bin"},
		)
		if result.returncode != 0:
			self.fail(
				f"caddy validate failed:\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}"
			)


if __name__ == "__main__":
	unittest.main(verbosity=2)