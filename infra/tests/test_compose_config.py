# Testy infra — lekkie, bez zależności od dockera w CI.
#
# Uruchomienie (z korzenia repo):
#   python -m infra.tests
# albo pojedynczo:
#   python -m infra.tests.test_compose_config
#   python -m infra.tests.test_caddyfile
#   python -m infra.tests.test_cloudflared_config
#
# Testy compose beda propozycwalac `docker compose config` JESLI `docker` jest w PATH.
# W srodowiskach bez dockera (np. CI bez runnera docker) — pomijamy te asserje i
# walidujemy tylko strukture YAML.

from __future__ import annotations

import shutil
import subprocess
import unittest
from pathlib import Path

import yaml

INFRA_ROOT = Path(__file__).resolve().parent.parent
COMPOSE_PROD = INFRA_ROOT / "docker-compose.yml"
COMPOSE_DEV = INFRA_ROOT / "docker-compose.dev.yml"


def _yaml_load(path: Path) -> dict:
	with path.open(encoding="utf-8") as f:
		return yaml.safe_load(f)


def _has_docker() -> bool:
	return shutil.which("docker") is not None


class DockerComposeConfigTest(unittest.TestCase):
	"""Walidacja struktury i (opcjonalnie) CLI docker compose config."""

	def setUp(self) -> None:
		if not COMPOSE_PROD.exists():
			self.skipTest(f"Brak pliku {COMPOSE_PROD}")
		if not COMPOSE_DEV.exists():
			self.skipTest(f"Brak pliku {COMPOSE_DEV}")
		self.cfg_prod = _yaml_load(COMPOSE_PROD)
		self.cfg_dev = _yaml_load(COMPOSE_DEV)

	def test_yaml_is_valid(self) -> None:
		self.assertIsInstance(self.cfg_prod, dict)
		self.assertIsInstance(self.cfg_dev, dict)
		self.assertIn("services", self.cfg_prod)
		self.assertIn("services", self.cfg_dev)

	def test_prod_required_services(self) -> None:
		svcs = set(self.cfg_prod["services"].keys())
		self.assertEqual(
			svcs,
			{"api", "web", "caddy", "cloudflared"},
			f"Brak/nadmiar serwisow w produkcji: {svcs}",
		)

	def test_dev_required_services(self) -> None:
		svcs = set(self.cfg_dev["services"].keys())
		self.assertEqual(
			svcs,
			{"api", "web"},
			f"Dev compose powinien miec tylko api+web: {svcs}",
		)

	def test_prod_all_services_have_restart_policy(self) -> None:
		for name, svc in self.cfg_prod["services"].items():
			with self.subTest(service=name):
				self.assertEqual(
					svc.get("restart"),
					"unless-stopped",
					f"Serwis {name} nie ma restart: unless-stopped",
				)

	def test_prod_services_have_healthcheck_except_cloudflared(self) -> None:
		for name, svc in self.cfg_prod["services"].items():
			if name == "cloudflared":
				with self.subTest(service=name):
					self.assertNotIn(
						"healthcheck",
						svc,
						"cloudflared nie powinien miec healthcheck (to tunel, nie aplikacja)",
					)
			else:
				with self.subTest(service=name):
					self.assertIn(
						"healthcheck",
						svc,
						f"Serwis {name} nie ma healthcheck",
					)
					hc = svc["healthcheck"]
					self.assertIn("test", hc)
					self.assertIn("interval", hc)
					self.assertIn("timeout", hc)
					self.assertIn("retries", hc)

	def test_prod_volumes_are_named(self) -> None:
		vols = self.cfg_prod.get("volumes", {})
		if not vols:
			self.fail("Produkcyjny compose nie definiuje wolumenow")
		for vol_name in vols:
			with self.subTest(volume=vol_name):
				self.assertIsNotNone(vol_name)

	def test_prod_images_pinned(self) -> None:
		# Sprawdzamy obrazy z `image:` (nie build) — nie powinny byc :latest
		for name, svc in self.cfg_prod["services"].items():
			img = svc.get("image")
			if not img:
				continue
			with self.subTest(service=name):
				if "${" in img:
					self.assertNotIn(
						":latest",
						img.split(":", 1)[1] if ":" in img else "",
						f"Obraz {name}={img} nie moze miec :latest jako default",
					)

	def test_prod_cloudflared_image_pinned(self) -> None:
		img = self.cfg_prod["services"]["cloudflared"].get("image")
		self.assertIsNotNone(img, "cloudflared musi miec image")
		self.assertRegex(
			img,
			r"cloudflare/cloudflared:\d{4}\.\d+\.\d+",
			f"cloudflared image powinien byc spinnowany (np. 2024.5.0), jest: {img}",
		)

	def test_dev_uses_dev_image_tag(self) -> None:
		api = self.cfg_dev["services"]["api"]
		self.assertEqual(
			api.get("image"),
			"wycinka-api:dev",
			"Dev compose powinien uzywac image z sufiksem :dev",
		)

	def test_dev_exposes_api_and_web_ports(self) -> None:
		api_ports = self.cfg_dev["services"]["api"].get("ports", [])
		web_ports = self.cfg_dev["services"]["web"].get("ports", [])
		self.assertTrue(len(api_ports) >= 1, "Brak portow dla api w dev compose")
		self.assertTrue(len(web_ports) >= 1, "Brak portow dla web w dev compose")

	def test_dev_uses_reload_command(self) -> None:
		api_cmd = self.cfg_dev["services"]["api"].get("command", "")
		self.assertIn(
			"--reload",
			api_cmd,
			"Dev compose api powinien miec --reload w uvicorn",
		)

	def test_dev_binds_app_dir(self) -> None:
		api_vols = self.cfg_dev["services"]["api"].get("volumes", [])
		has_bind = any(":/app/app" in str(v) and ".." in str(v) for v in api_vols)
		self.assertTrue(has_bind, "Dev compose api powinien bindowac ../apps/api/app:/app/app")

	def test_prod_no_host_ports_except_caddy(self) -> None:
		# W produkcji api i web powinny byc za Caddy — bez portow na hoscie
		for name in ("api", "web", "cloudflared"):
			svc = self.cfg_prod["services"][name]
			ports = svc.get("ports", [])
			self.assertEqual(
				ports,
				[],
				f"Serwis {name} nie powinien eksponowac portow na hosta w prod (porty={ports})",
			)

	def test_prod_caddy_exposes_80_and_443(self) -> None:
		caddy_ports = self.cfg_prod["services"]["caddy"].get("ports", [])
		port_numbers = []
		for p in caddy_ports:
			port_str = str(p).split(":")[0]
			try:
				port_numbers.append(int(port_str))
			except ValueError:
				pass
		self.assertIn(80, port_numbers, "Caddy musi eksponowac port 80")
		self.assertIn(443, port_numbers, "Caddy musi eksponowac port 443")

	def test_prod_caddy_depends_on_api_healthy(self) -> None:
		caddy = self.cfg_prod["services"]["caddy"]
		deps = caddy.get("depends_on", {})
		if "api" in deps:
			condition = deps["api"].get("condition", "")
			self.assertIn(
				"healthy",
				condition,
				"Caddy powinien czekac na zdrowy api",
			)

	@unittest.skipUnless(_has_docker(), "docker CLI niedostepny")
	def test_docker_compose_config_cli(self) -> None:
		"""Walidacja przez `docker compose config` — wymaga CLI."""
		for compose_file in (COMPOSE_PROD, COMPOSE_DEV):
			with self.subTest(config=compose_file.name):
				result = subprocess.run(
					[
						"docker",
						"compose",
						"-f",
						str(compose_file),
						"config",
						"--quiet",
					],
					capture_output=True,
					text=True,
					timeout=30,
				)
				if result.returncode != 0:
					self.fail(
						f"docker compose config failed for {compose_file.name}:\n"
						f"STDOUT: {result.stdout}\nSTDERR: {result.stderr}"
					)


if __name__ == "__main__":
	unittest.main(verbosity=2)