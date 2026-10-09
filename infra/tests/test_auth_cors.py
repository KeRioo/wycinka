# Testy auth + CORS — walidacja konfiguracji infra dla BACKLOG #3 (CORS env-driven)
# oraz decyzji: simple password basic_auth (prod only).
#
# Sprawdzamy (strukturalnie, bez uruchamiania kontenerów):
# - Caddyfile: snippety cors_production/cors_development/auth_production/auth_development,
#   env-driven origin ({$FRONTEND_ORIGIN:...}), fallback "*" TYLKO w dev,
#   basic_auth z AUTH_PASSWORD_HASH, preflight OPTIONS bypass
# - caddy/entrypoint.sh: render wg APP_ENV (substytucja importu przed parserem)
# - nginx/nginx.conf: nagłówki Access-Control + auth_basic (parity z Caddy)
# - .env.example: FRONTEND_ORIGIN + AUTH_PASSWORD_HASH + placeholder hash
#
# Kolejność deklaracji: snippety MUSZĄ być przed importem w Caddyfile
# (parser Caddy rozwija `import` przed substytucją env) — testowana też.

from __future__ import annotations

import re
import subprocess
import unittest
from pathlib import Path

INFRA_ROOT = Path(__file__).resolve().parent.parent
CADDYFILE = INFRA_ROOT / "caddy" / "Caddyfile"
ENTRYPOINT = INFRA_ROOT / "caddy" / "entrypoint.sh"
ENV_EXAMPLE = INFRA_ROOT / ".env.example"
NGINX_CONF = INFRA_ROOT / "nginx" / "nginx.conf"


def _snippet(content: str, name: str) -> str:
	# Treść snippetu `(nazwa) { ... }` — nawiasy zbalansowane do 1 poziomu
	m = re.search(rf"\({re.escape(name)}\)\s*\{{", content)
	if not m:
		return ""
	start = m.end()
	depth = 1
	out = []
	for ch in content[start:]:
		if ch == "{":
			depth += 1
		elif ch == "}":
			depth -= 1
			if depth == 0:
				break
		out.append(ch)
	return "".join(out).strip()


class CaddyAuthCorsTest(unittest.TestCase):
	@classmethod
	def setUpClass(cls) -> None:
		if not CADDYFILE.exists():
			raise unittest.SkipTest(f"Brak pliku {CADDYFILE}")
		cls.content = CADDYFILE.read_text(encoding="utf-8")

	def test_cors_snippets_present(self) -> None:
		for name in ("cors_production", "cors_development"):
			with self.subTest(snippet=name):
				self.assertIn(f"({name}) {{", self.content)

	def test_cors_prod_origin_env_driven(self) -> None:
		prod = _snippet(self.content, "cors_production")
		self.assertGreater(len(prod), 0, "Brak snippetu cors_production")
		self.assertRegex(
			prod,
			r'Access-Control-Allow-Origin\s+"\{\$FRONTEND_ORIGIN:[^"]*\}"',
			"Prod CORS origin musi pochodzić z env FRONTEND_ORIGIN (placeholder)",
		)

	def test_cors_wildcard_only_in_development(self) -> None:
		prod = _snippet(self.content, "cors_production")
		dev = _snippet(self.content, "cors_development")
		self.assertNotIn('Access-Control-Allow-Origin "*"', prod,
			"Access-Control-Allow-Origin: * jest dozwolone TYLKO w dev")
		self.assertIn('Access-Control-Allow-Origin "*"', dev,
			"Dev fallback na * jest wymagany (BACKLOG #3)")

	def test_cors_methods_and_headers_parity(self) -> None:
		cors = _snippet(self.content, "cors_production")
		for needle in ("Access-Control-Allow-Methods", "Access-Control-Allow-Headers", "Range"):
			with self.subTest(needle=needle):
				self.assertIn(needle, cors)

	def test_preflight_options_bypass(self) -> None:
		# OPTIONS ma iść na krótkie 204 z nagłówkami CORS (handle @cors_preflight)
		self.assertIn("@cors_preflight", self.content)
		self.assertRegex(
			self.content,
			r"method\s+OPTIONS",
			"Preflight matcher musi matchować method OPTIONS",
		)
		self.assertIn("respond 204", _snippet(self.content, "cors_production"))

	def test_auth_production_basic_auth(self) -> None:
		auth = _snippet(self.content, "auth_production")
		self.assertGreater(len(auth), 0, "Brak snippetu auth_production")
		self.assertIn("basic_auth", auth)
		self.assertIn('{$AUTH_PASSWORD_HASH:', auth,
			"Hash hasła musi przychodzić z env AUTH_PASSWORD_HASH")
		# user wycinka (jeden użytkownik)
		self.assertRegex(auth, r"wycinka\s+\{\$AUTH", "User basic_auth ma być `wycinka`")

	def test_auth_dev_has_no_password(self) -> None:
		auth = _snippet(self.content, "auth_development")
		self.assertEqual(
			"", auth.strip(),
			"Snippet auth_development ma być pusty (dev bez hasła)",
		)

	def test_auth_preflight_bypasses_basic_auth(self) -> None:
		# OPTIONS nie może przejść przez basic_auth (browsers do not send
		# credentials on preflight) — basic_auth ograniczony do @not..._preflight
		auth = _snippet(self.content, "auth_production")
		self.assertIn("method OPTIONS", auth)
		self.assertIn("not method OPTIONS", auth)
		self.assertIn("basic_auth @", auth, "basic_auth ma być ograniczony matcherem")

	def test_snippets_defined_before_import(self) -> None:
		# Parser rozwija import PRZED substytucją env — snippety przed importem
		first_import = self.content.find("import {$APP_ENV:production}_cors")
		self.assertNotEqual(first_import, -1, "Brak importu snippetów w site")
		first_snippet = self.content.find("(cors_production) {")
		self.assertLess(
			first_snippet, first_import,
			"Snippety muszą być zdefiniowane PRZED import (parser jawi je leniwie)",
		)

	def test_entrypoint_renders_app_env(self) -> None:
		self.assertTrue(ENTRYPOINT.exists())
		ep = ENTRYPOINT.read_text(encoding="utf-8")
		for needle in (
			'APP_ENV="${APP_ENV:-production}"',
			"production|development",
			"_cors/cors_${APP_ENV}",
			"_auth/auth_${APP_ENV}",
		):
			with self.subTest(needle=needle):
				self.assertIn(needle, ep)

	def test_entrypoint_syntax(self) -> None:
		result = subprocess.run(
			["bash", "-n", str(ENTRYPOINT)],
			capture_output=True,
			text=True,
		)
		if result.returncode != 0:
			self.fail(f"bash -n entrypoint.sh: {result.stderr}")

	def test_render_smoke_debug(self) -> None:
		# Symulacja entrypoint.sh: importy rozwinęły się na snippety
		rendered = self.content.replace(
			"{$APP_ENV:production}_cors", "cors_development"
		).replace("{$APP_ENV:production}_auth", "auth_development")
		self.assertIn("import cors_development", rendered)
		self.assertIn("(cors_development) {", rendered)
		# i na snippety prod
		rendered_r = self.content.replace(
			"{$APP_ENV:production}_cors", "cors_production"
		).replace("{$APP_ENV:production}_auth", "auth_production")
		self.assertIn("import cors_production", rendered_r)

	def test_security_headers_still_present(self) -> None:
		for header in ("X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy"):
			with self.subTest(header=header):
				self.assertIn(header, self.content)


class EnvExampleAuthCorsTest(unittest.TestCase):
	@classmethod
	def setUpClass(cls) -> None:
		if not ENV_EXAMPLE.exists():
			raise unittest.SkipTest(f"Brak pliku {ENV_EXAMPLE}")
		cls.content = ENV_EXAMPLE.read_text(encoding="utf-8")

	def test_frontend_origin_documented(self) -> None:
		self.assertIn("FRONTEND_ORIGIN=", self.content)
		self.assertRegex(
			self.content,
			r"(?m)^FRONTEND_ORIGIN=https://\w",
			"FRONTEND_ORIGIN ma być URL origin (dokładne dopasowanie w prod)",
		)

	def test_auth_password_hash_documented(self) -> None:
		self.assertIn("AUTH_PASSWORD_HASH=", self.content)
		# Procedura generacji w pliku (placeholder komendy caddy hash-password)
		self.assertIn("caddy hash-password", self.content)


class NginxAuthCorsTest(unittest.TestCase):
	"""Parity nginx↔caddy: nagłówki CORS + auth basic + preflight."""

	@classmethod
	def setUpClass(cls) -> None:
		if not NGINX_CONF.exists():
			raise unittest.SkipTest(f"Brak pliku {NGINX_CONF}")
		cls.content = NGINX_CONF.read_text(encoding="utf-8")

	def test_cors_headers_present(self) -> None:
		for needle in (
			"Access-Control-Allow-Origin",
			"Access-Control-Allow-Methods",
			"Access-Control-Allow-Headers",
			"Range",
		):
			with self.subTest(needle=needle):
				self.assertIn(needle, self.content)

	def test_cors_origin_not_wildcard_by_default(self) -> None:
		# Nie _default na '*'; domain placeholder z dokumentacją
		origin_line = [l for l in self.content.splitlines()
			if "Access-Control-Allow-Origin" in l][0]
		self.assertNotIn('"*"', origin_line,
			"Domyślnie nginx prod nie ma odpuszczać CORS *; edytowalne ręcznie")

	def test_basic_auth_parity(self) -> None:
		self.assertIn("auth_basic", self.content)
		self.assertIn("auth_basic_user_file", self.content)
		self.assertIn(".htpasswd", self.content)

	def test_preflight_options_short_circuit(self) -> None:
		self.assertRegex(
			self.content,
			r"if\s+\(\s*\$request_method\s*=\s*OPTIONS\s*\)\s*\{\s*return\s+204;",
			"Nginx: OPTIONS ma iść na 204 bez auth (parity z Caddy)",
		)


if __name__ == "__main__":
	unittest.main(verbosity=2)
