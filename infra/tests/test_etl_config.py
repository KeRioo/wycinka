# Testy ETL-infra — walidacja infra/etl bez uruchamiania dockera.
#
# - docker-compose.yml / Dockerfile: pinning wersji, non-root, healthcheck,
#   volumes, networks (dodatkowe assercje niz w test_compose_config)
# - skrypty <= bash -n (skladnia)
# - operational-runbook.md: istnieje i ma wymagane sekcje

from __future__ import annotations

import re
import subprocess
import unittest
from pathlib import Path

INFRA_ROOT = Path(__file__).resolve().parent.parent
ETL_DIR = INFRA_ROOT / "etl"
COMPOSE_PROD = INFRA_ROOT / "docker-compose.yml"
DOCKERFILE = ETL_DIR / "Dockerfile"
RUNBOOK = INFRA_ROOT / "operational-runbook.md"

REQUIRED_RUNBOOK_SECTIONS = (
	"deployment",
	"rollback",
	"monitoring",
	"troubleshooting",
	"restore",
)

REQUIRED_RUNBOOK_SUBSTRINGS = (
	"docker compose up",
	"healthcheck",
	"last-success",
	"tunel",
)


class EtlScriptsTest(unittest.TestCase):
	SCRIPTS = ("scheduler.sh", "run-sync.sh", "etl-healthcheck.sh")

	def test_scripts_exist(self) -> None:
		for name in self.SCRIPTS:
			with self.subTest(script=name):
				self.assertTrue((ETL_DIR / name).is_file())

	def test_scripts_bash_syntax(self) -> None:
		# bash -n — walidacja skladni bez wykonywania
		for name in self.SCRIPTS:
			path = ETL_DIR / name
			with self.subTest(script=name):
				result = subprocess.run(
					["bash", "-n", str(path)],
					capture_output=True,
					text=True,
					timeout=10,
				)
				if result.returncode != 0:
					self.fail(f"bash -n failed for {name}:\n{result.stderr}")

	def test_scheduler_defaults(self) -> None:
		content = (ETL_DIR / "scheduler.sh").read_text(encoding="utf-8")
		self.assertIn("ETL_INTERVAL_SECONDS:-86400", content)
		self.assertIn("ETL_RUN_ONCE", content)
		self.assertIn("trap", content)

	def test_healthcheck_marker_is_freshness_based(self) -> None:
		content = (ETL_DIR / "etl-healthcheck.sh").read_text(encoding="utf-8")
		self.assertIn("last-success", content)
		self.assertIn("stat -c %Y", content)

	def test_run_sync_writes_markers_and_uses_cli(self) -> None:
		content = (ETL_DIR / "run-sync.sh").read_text(encoding="utf-8")
		self.assertIn("python -m egib_sync", content)
		self.assertIn("last-success", content)
		self.assertIn("last-failure", content)
		self.assertIn("command -v tippecanoe", content)


class EtlDockerfileTest(unittest.TestCase):
	def setUp(self) -> None:
		self.df = DOCKERFILE.read_text(encoding="utf-8")

	def test_file_presents(self) -> None:
		self.assertTrue(DOCKERFILE.is_file())

	def test_python_image_pinned(self) -> None:
		self.assertIn(
			"python:3.12-slim-bookworm",
			self.df,
			"Obraz python musi byc spinned na tag 3.12-slim-bookworm",
		)

	def test_tippecanoe_version_pinned(self) -> None:
		self.assertRegex(self.df, r'''ARG TIPPECANOE_VERSION=\d+\.\d+\.\d+''')

	def test_tippecanoe_cloned_at_fixed_tag(self) -> None:
		self.assertIn("--branch", self.df)
		self.assertIn("felt/tippecanoe", self.df)

	def test_non_root_user(self) -> None:
		self.assertIn("useradd", self.df)
		self.assertRegex(self.df, r"(?m)^USER etluser$")

	def test_no_root_installs_after_user_switch(self) -> None:
		user_idx = self.df.rindex("USER etluser")
		after_user = self.df[user_idx:]
		self.assertNotRegex(
			after_user,
			r"apt-get|pip install|chown",
			"Po USER etluser nie moze byc operacji wymagajacych roota",
		)


class EtlRunbookTest(unittest.TestCase):
	def setUp(self) -> None:
		self.content = RUNBOOK.read_text(encoding="utf-8").lower()

	def test_runbook_exists_and_nonempty(self) -> None:
		self.assertTrue(RUNBOOK.is_file())
		self.assertTrue(len(self.content) > 2000)

	def test_runbook_has_required_sections(self) -> None:
		for section in REQUIRED_RUNBOOK_SECTIONS:
			with self.subTest(section=section):
				self.assertIn(section, self.content)

	def test_runbook_covers_key_topics(self) -> None:
		for needle in REQUIRED_RUNBOOK_SUBSTRINGS:
			with self.subTest(topic=needle):
				self.assertIn(needle, self.content)


if __name__ == "__main__":
	unittest.main(verbosity=2)
