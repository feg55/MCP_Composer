from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

AppMode = Literal["local", "hosted"]
BACKEND_DIR = Path(__file__).resolve().parents[2]


def _csv(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    return tuple(item.strip().rstrip("/") for item in value.split(",") if item.strip())


def _bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"Invalid boolean setting: {value!r}.")


def _positive_int(value: str | None, default: int) -> int:
    if value is None:
        return default
    parsed = int(value)
    if parsed <= 0:
        raise ValueError("Integer settings must be positive.")
    return parsed


@dataclass(frozen=True, slots=True)
class Settings:
    app_version: str = "0.1.0"
    app_mode: AppMode = "local"
    allowed_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )
    allowed_hosts: tuple[str, ...] = ("localhost", "127.0.0.1", "testserver")
    remote_hosts: tuple[str, ...] = ()
    data_dir: Path = BACKEND_DIR / "app" / "generated"
    docs_enabled: bool = True
    require_origin: bool = False
    max_request_bytes: int = 1_000_000
    frontend_dist_dir: Path | None = None

    def __post_init__(self) -> None:
        if self.app_mode not in {"local", "hosted"}:
            raise ValueError("APP_MODE must be either local or hosted.")
        if not self.allowed_origins:
            raise ValueError("At least one allowed frontend origin is required.")
        if not self.allowed_hosts:
            raise ValueError("At least one allowed host is required.")
        if self.hosted and (
            any(origin in {"*", "null"} for origin in self.allowed_origins)
            or any("*" in host for host in self.allowed_hosts)
        ):
            raise ValueError("Hosted mode requires exact origins and hosts.")
        if self.hosted and not self.require_origin:
            raise ValueError("Hosted mode requires Origin validation.")
        for origin in self.allowed_origins:
            parsed = urlsplit(origin)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.username
                or parsed.password
                or parsed.path not in {"", "/"}
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError(f"Invalid allowed origin: {origin!r}.")
            if (
                self.hosted
                and parsed.scheme != "https"
                and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
            ):
                raise ValueError("Hosted browser origins require HTTPS outside loopback.")
        if self.max_request_bytes <= 0:
            raise ValueError("max_request_bytes must be positive.")
        object.__setattr__(
            self,
            "remote_hosts",
            tuple(host.lower().rstrip(".") for host in self.remote_hosts),
        )
        object.__setattr__(self, "data_dir", self.data_dir.expanduser().resolve())
        if self.frontend_dist_dir is not None:
            object.__setattr__(
                self,
                "frontend_dist_dir",
                self.frontend_dist_dir.expanduser().resolve(),
            )

    @property
    def hosted(self) -> bool:
        return self.app_mode == "hosted"

    @classmethod
    def from_env(cls) -> "Settings":
        raw_mode = os.getenv("APP_MODE", "hosted").strip().lower()
        if raw_mode not in {"local", "hosted"}:
            raise ValueError("APP_MODE must be either local or hosted.")
        mode: AppMode = raw_mode

        legacy_origins = os.getenv("FRONTEND_ORIGIN")
        configured_origins = os.getenv("MCP_COMPOSER_ALLOWED_ORIGINS") or legacy_origins
        if mode == "hosted" and not configured_origins:
            raise ValueError("MCP_COMPOSER_ALLOWED_ORIGINS is required when APP_MODE=hosted.")
        origins = _csv(configured_origins or "http://localhost:5173,http://127.0.0.1:5173")
        default_hosts = "localhost,127.0.0.1,testserver" if mode == "local" else ""
        hosts = _csv(os.getenv("MCP_COMPOSER_ALLOWED_HOSTS") or default_hosts)
        if mode == "hosted" and not hosts:
            raise ValueError("MCP_COMPOSER_ALLOWED_HOSTS is required when APP_MODE=hosted.")

        data_dir = Path(
            os.getenv(
                "MCP_COMPOSER_DATA_DIR",
                str(BACKEND_DIR / "app" / "generated"),
            )
        )
        dist_value = os.getenv("FRONTEND_DIST_DIR")
        return cls(
            app_version=os.getenv("MCP_COMPOSER_VERSION", "0.1.0").strip() or "0.1.0",
            app_mode=mode,
            allowed_origins=origins,
            allowed_hosts=hosts,
            remote_hosts=_csv(os.getenv("MCP_COMPOSER_REMOTE_HOSTS")),
            data_dir=data_dir,
            docs_enabled=_bool(os.getenv("MCP_COMPOSER_DOCS_ENABLED"), mode == "local"),
            require_origin=_bool(
                os.getenv("MCP_COMPOSER_REQUIRE_ORIGIN"),
                mode == "hosted",
            ),
            max_request_bytes=_positive_int(
                os.getenv("MCP_COMPOSER_MAX_REQUEST_BYTES"),
                1_000_000,
            ),
            frontend_dist_dir=Path(dist_value) if dist_value else None,
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()
