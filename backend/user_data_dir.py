"""Frozen-aware user data directory resolution.

Dev mode (source checkout) stores user data in the repository's ``data/``
folder, exactly as it always has. In a frozen build ``__file__`` resolves
inside the app bundle, so module-relative arithmetic would store user data in
the install folder itself -- the Mission 033 finding
(``_internal\\data\\credentials.json``). Frozen builds therefore use the
OS-conventional per-user directory ``%LOCALAPPDATA%\\ModelMix`` instead.
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# Repo-relative data directory. From this module's own location this is the
# same two-``.parent`` arithmetic settings.py and personas.py already used,
# landing on the repository's ``data/`` folder.
_REPO_DATA_DIR = Path(__file__).parent.parent / "data"

# Per-user application data folder name used by frozen Windows builds.
_APP_DIR_NAME = "ModelMix"


def is_frozen() -> bool:
    """Return True when running inside a PyInstaller frozen build."""
    return getattr(sys, "frozen", False)


def resolve_user_data_dir() -> Path:
    """Return the directory where user data files live, creating it if needed.

    When not frozen: the existing repository ``data/`` directory, byte-for-byte
    the same location the three user-data files already use.

    When frozen (Windows): ``%LOCALAPPDATA%/ModelMix``. If ``LOCALAPPDATA``
    is absent, fall back to the directory containing the running executable
    and log a clear warning rather than crashing.
    """
    if not is_frozen():
        data_dir = _REPO_DATA_DIR
    else:
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            data_dir = Path(local_app_data) / _APP_DIR_NAME
        else:
            data_dir = Path(sys.executable).parent
            logger.warning(
                "LOCALAPPDATA is not set; falling back to the executable "
                "directory %s for user data", data_dir
            )
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir