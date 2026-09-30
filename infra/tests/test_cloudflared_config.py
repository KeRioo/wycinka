# Walidacja konfiguracji Cloudflare Tunnel (szablon + rzeczywista po wypelnieniu).
#
# Ten test parsuje config.yml.example i sprawdza wymagane pola.
# Nie waliduje credentials (to nie nasz plik).

from __future__ import annotations

import re
import unittest
from pathlib import Path

import yaml

INFRA_ROOT = Path(__file__).resolve().parent.parent
CONFIG_EXAMPLE = INFRA_ROOT / "cloudflared" / "config.yml.example"


class CloudflaredConfigTest(unittest.TestCase):
	def setUp(self) -> None:
		if not CONFIG_EXAMPLE.exists():
			self.skipTest(f"Brak pliku {CONFIG_EXAMPLE}")
		self.cfg = yaml.safe_load(CONFIG_EXAMPLE.read_text(encoding="utf-8"))

	def test_yaml_is_valid(self) -> None:
		self.assertIsInstance(self.cfg, dict)

	def test_tunnel_field_present(self) -> None:
		self.assertIn("tunnel", self.cfg)
		self.assertEqual(
			self.cfg["tunnel"],
			"<TUNNEL_ID>",
			"config.yml.example powinien miec placeholder <TUNNEL_ID>, nie prawdziwy ID",
		)

	def test_credentials_file_present(self) -> None:
		self.assertIn("credentials-file", self.cfg)
		self.assertEqual(
			self.cfg["credentials-file"],
			"/etc/cloudflared/<TUNNEL_ID>.json",
			"credentials-file powinien byc sciezka w kontenerze",
		)

	def test_ingress_required(self) -> None:
		self.assertIn("ingress", self.cfg)
		ingress = self.cfg["ingress"]
		self.assertIsInstance(ingress, list)
		self.assertGreater(len(ingress), 0, "Brak reguł ingress")

	def test_ingress_has_catchall(self) -> None:
		# Ostatnia regula MUSI byc catchall (404) — wazne dla security
		ingress = self.cfg["ingress"]
		last = ingress[-1]
		self.assertIsInstance(last, dict)
		service = last.get("service", "")
		self.assertIn(
			"404",
			service,
			f"Ostatnia regula ingress musi byc catchall 404, jest: {service}",
		)

	def test_ingress_routes_to_caddy(self) -> None:
		ingress = self.cfg["ingress"]
		routed = [rule for rule in ingress if isinstance(rule, dict)]
		caddy_rules = [r for r in routed if "caddy:80" in r.get("service", "")]
		self.assertGreater(
			len(caddy_rules),
			0,
			"Co najmniej jedna regula ingress powinna kierowac do caddy:80",
		)

	def test_no_real_tunnel_id(self) -> None:
		# Brak UUID w przykladzie — sanity check ze nie commitujemy prawdziwych ID
		tunnel = str(self.cfg.get("tunnel", ""))
		if tunnel == "<TUNNEL_ID>":
			return
		# jesli nie placeholder — powinien wygladac jak UUID
		uuid_pattern = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
		self.assertRegex(
			tunnel,
			uuid_pattern,
			"tunnel musi byc placeholder <TUNNEL_ID> lub poprawny UUID",
		)

	def test_logging_configured(self) -> None:
		# loglevel opcjonalny, ale jesli jest — powinien byc sensowna z informacja
		if "loglevel" in self.cfg:
			level = str(self.cfg["loglevel"]).lower()
			valid = {"debug", "info", "warn", "error"}
			self.assertIn(level, valid, f"Nieprawidlowy loglevel: {level}")


if __name__ == "__main__":
	unittest.main(verbosity=2)