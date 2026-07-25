from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from app.core.settings import get_settings


def ensure_generated_dir(data_dir: Path | None = None) -> Path:
    target = (data_dir or get_settings().data_dir).resolve()
    target.mkdir(mode=0o700, parents=True, exist_ok=True)
    target.chmod(0o700)
    return target


def save_json(
    filename: str,
    payload: dict[str, Any],
    data_dir: Path | None = None,
) -> Path:
    safe_name = Path(filename).name
    if safe_name != filename:
        raise ValueError("Generated filename must not contain path separators.")
    output_dir = ensure_generated_dir(data_dir)
    target = output_dir / safe_name
    descriptor, temporary_name = tempfile.mkstemp(
        dir=output_dir,
        prefix=f".{safe_name}.",
        suffix=".tmp",
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        temporary.chmod(0o600)
        temporary.replace(target)
        target.chmod(0o600)
    finally:
        temporary.unlink(missing_ok=True)
    return target
