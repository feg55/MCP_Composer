from __future__ import annotations

import json
from pathlib import Path
from typing import Any


GENERATED_DIR = Path(__file__).resolve().parents[1] / "generated"


def ensure_generated_dir() -> Path:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    return GENERATED_DIR


def save_json(filename: str, payload: dict[str, Any]) -> Path:
    target = ensure_generated_dir() / filename
    target.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return target

