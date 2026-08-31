"""Tests for Windows ACL hardening of the file credential backend (Mission 026).

These tests never invoke a real ``icacls``; ``subprocess.run`` and
``sys.platform`` are mocked. The Windows-path tests here require
``sys.platform == "win32"`` at call time.
"""

import json
import logging
import subprocess
import sys

import pytest

from backend.credentials import file_backend


@pytest.fixture()
def cred_file(tmp_path, monkeypatch):
    path = tmp_path / "credentials.json"
    monkeypatch.setattr(file_backend, "CREDENTIALS_FILE", path)
    yield path


@pytest.fixture(autouse=True)
def _reset_process_guards():
    """Module-level once-per-process flags must not leak between tests."""
    file_backend._startup_warned = False
    file_backend._hardened = False
    yield
    file_backend._startup_warned = False
    file_backend._hardened = False


def _windows(monkeypatch):
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(
        file_backend, "_resolve_windows_current_user", lambda: "ACME\\alice"
    )


class _Result:
    def __init__(self, returncode, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def _raising(exc):
    def _fn(*args, **kwargs):
        raise exc
    return _fn


# --- Acceptance 1: Windows write invokes icacls with correct path + user ----


def test_windows_write_invokes_icacls_args(cred_file, monkeypatch):
    _windows(monkeypatch)
    calls = []
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *args, **kwargs: calls.append(args) or _Result(0),
    )

    file_backend.set_secret("api:openai", "sk-test")

    assert len(calls) == 1
    cmd = calls[0][0]
    assert cmd[0] == "icacls"
    assert cmd[1] == str(cred_file)
    assert "/inheritance:r" in cmd
    assert "/grant:r" in cmd
    assert cmd[4].endswith(":F")
    assert "ACME\\alice" in cmd[4]


# --- Acceptance 2: non-Windows never invokes icacls -------------------------


def test_non_windows_never_invokes_icacls(cred_file, monkeypatch):
    monkeypatch.setattr(sys, "platform", "linux")
    calls = []
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *args, **kwargs: calls.append(args) or _Result(0),
    )

    file_backend.set_secret("api:openai", "sk-test")

    assert calls == [], "icacls must never be invoked off Windows"


# --- Acceptance 3: failing icacls does not raise; write still succeeds -------


@pytest.mark.parametrize(
    "hardener",
    [
        lambda: _Result(1, stderr="Access is denied."),
        lambda: (_ for _ in ()).throw(OSError("icacls not found")),
    ],
)
def test_failing_icacls_does_not_raise_and_value_survives(
    cred_file, monkeypatch, hardener
):
    _windows(monkeypatch)
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: hardener())

    file_backend.set_secret("api:openai", "sk-test")  # must not raise

    data = json.loads(cred_file.read_text())
    assert data["api:openai"] == "sk-test"


# --- Acceptance 4: failing case logs a warning -------------------------------


def test_failing_icacls_logs_warning(cred_file, monkeypatch, caplog):
    _windows(monkeypatch)
    monkeypatch.setattr(
        subprocess, "run", lambda *a, **k: (_ for _ in ()).throw(OSError("boom"))
    )
    with caplog.at_level(logging.WARNING, logger="backend.credentials.file_backend"):
        file_backend.set_secret("api:openai", "sk-test")

    assert any(
        r.levelno == logging.WARNING for r in caplog.records
    ), "no warning logged on icacls failure"


# --- Acceptance 5: once-per-process startup warning fires once on Windows + an
# ---              existing unhardened file, and not a second time ------------


def test_startup_warning_fires_once_on_existing_unhardened_file(
    cred_file, monkeypatch, caplog
):
    _windows(monkeypatch)
    cred_file.write_text(json.dumps({"api:old": "sk-old"}))
    calls = []
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *args, **kwargs: calls.append(args) or _Result(0),
    )

    with caplog.at_level(logging.WARNING, logger="backend.credentials.file_backend"):
        file_backend.get_secret("api:old")
        file_backend.get_secret("api:old")

    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1, "startup warning must fire exactly once"
    assert calls == [], "reads must not trigger icacls"


# --- Acceptance 6: no startup warning on non-Windows regardless of file ----


def test_no_startup_warning_on_non_windows(cred_file, monkeypatch, caplog):
    monkeypatch.setattr(sys, "platform", "linux")
    cred_file.write_text(json.dumps({"api:old": "sk-old"}))
    calls = []
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *args, **kwargs: calls.append(args) or _Result(0),
    )

    with caplog.at_level(logging.WARNING, logger="backend.credentials.file_backend"):
        file_backend.get_secret("api:old")

    assert not [r for r in caplog.records if r.levelno == logging.WARNING]
    assert calls == [], "icacls must never be invoked off Windows"
