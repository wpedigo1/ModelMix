"""Plaintext credentials.json backend (mode 0o600 on Unix).

On Windows the file is additionally restricted to the current user account via
``icacls`` (no pywin32 dependency), because ``os.chmod(0o600)`` has no
meaningful per-user effect on Windows.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)

CREDENTIALS_FILE = Path(__file__).parent.parent.parent / "data" / "credentials.json"

# Fired only once per process (see _warn_if_unhardened).
_startup_warned = False
# Set True when _harden_credentials_file successfully restricted the file.
_hardened = False


def _is_windows() -> bool:
    return sys.platform == "win32"


def _resolve_windows_current_user() -> Optional[str]:
    """Resolve the current Windows user for an icacls grant principal.

    Prefer the USERNAME/USERDOMAIN environment variables (set reliably for a
    logged-in interactive session and for a user-run service), falling back to
    os.getlogin(), which can raise OSError when no controlling terminal is
    present (e.g. some service or SSH contexts).
    """
    user = os.environ.get("USERNAME")
    if user:
        domain = os.environ.get("USERDOMAIN")
        return f"{domain}\\{user}" if domain else user
    try:
        user = os.getlogin()
        if user:
            return user
    except OSError:
        pass
    return None


def _harden_credentials_file() -> bool:
    """Restrict CREDENTIALS_FILE to the current user on Windows.

    No-op (returns False) off Windows. Never raises: any icacls failure is
    caught and logged so a credential write still succeeds, mirroring the
    existing ``os.chmod ... except OSError: pass`` philosophy but with an
    operator-visible warning. Returns True only on a successful hardening.
    """
    global _hardened
    if not _is_windows():
        return False
    user = _resolve_windows_current_user()
    if not user:
        logger.warning(
            "Could not resolve the current Windows user; skipping ACL hardening for %s",
            CREDENTIALS_FILE,
        )
        return False
    cmd = ["icacls", str(CREDENTIALS_FILE), "/inheritance:r", "/grant:r", f"{user}:F"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
    except (OSError, subprocess.SubprocessError) as exc:
        logger.warning(
            "Failed to harden %s ACLs with icacls: %s", CREDENTIALS_FILE, exc
        )
        return False
    if result.returncode != 0:
        logger.warning(
            "icacls exited %s hardening %s: %s",
            result.returncode,
            CREDENTIALS_FILE,
            (result.stderr or result.stdout or "").strip(),
        )
        return False
    _hardened = True
    return True


def _warn_if_unhardened() -> None:
    """Log (once per process) if the credentials file is not user-restricted.

    Catches the case of a pre-existing plaintext file created before this
    hardening existed, or a previous hardening failure within this process.
    A file is considered unhardened unless our own hardening step succeeded
    this session; a file created before this process started has unknown
    history, so it is treated as unhardened and surfaces one warning.
    """
    global _startup_warned
    if _startup_warned:
        return
    _startup_warned = True
    if not _is_windows():
        return
    if not CREDENTIALS_FILE.exists():
        return
    if not _hardened:
        logger.warning(
            "The credentials file %s is not restricted to the current user account."
            " Restrict it to the current user (e.g. icacls %s /inheritance:r"
            " /grant:r \\\"current-user\\\":F) or move to OS keyring storage.",
            CREDENTIALS_FILE,
            CREDENTIALS_FILE,
        )


def _read_all() -> Dict[str, str]:
    _warn_if_unhardened()
    if not CREDENTIALS_FILE.exists():
        return {}
    try:
        with open(CREDENTIALS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {}
        return {str(k): str(v) for k, v in data.items() if v is not None and str(v)}
    except Exception:
        logger.exception("Failed to read %s", CREDENTIALS_FILE)
        return {}


def _write_all(data: Dict[str, str]) -> None:
    _warn_if_unhardened()
    CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)
    # Atomic write via temp file in same directory.
    fd, tmp_path = tempfile.mkstemp(
        dir=str(CREDENTIALS_FILE.parent),
        prefix=".credentials-",
        suffix=".tmp",
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
        os.replace(tmp_path, CREDENTIALS_FILE)
        try:
            os.chmod(CREDENTIALS_FILE, 0o600)
        except OSError:
            pass
        # Windows-only ACL hardening. Never raises; failures are logged.
        _harden_credentials_file()
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def get_secret(secret_id: str) -> Optional[str]:
    return _read_all().get(secret_id)


def set_secret(secret_id: str, value: str) -> None:
    data = _read_all()
    data[secret_id] = value
    _write_all(data)


def delete_secret(secret_id: str) -> None:
    data = _read_all()
    if secret_id in data:
        del data[secret_id]
        _write_all(data)


def list_present(secret_ids: list[str]) -> Dict[str, str]:
    data = _read_all()
    return {sid: data[sid] for sid in secret_ids if sid in data}


def wipe(secret_ids: list[str]) -> None:
    data = _read_all()
    changed = False
    for sid in secret_ids:
        if sid in data:
            del data[sid]
            changed = True
    if changed:
        _write_all(data)
