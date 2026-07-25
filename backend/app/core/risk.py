from __future__ import annotations

from typing import Any

from app.core.types import PermissionMode, RiskLevel

DESTRUCTIVE_KEYWORDS = ("delete", "drop", "remove", "destroy", "truncate", "purge")
EXTERNAL_KEYWORDS = ("send", "publish", "notify", "web_search", "fetch_page", "summarize_page")
WRITE_KEYWORDS = ("create", "update", "write", "insert", "restart", "mutate", "apply", "merge")
READ_KEYWORDS = ("read", "list", "search", "query", "get", "inspect", "explain", "fetch")


def detect_tool_risk(
    name: str,
    description: str = "",
    input_schema: dict[str, Any] | None = None,
) -> RiskLevel:
    haystack = f"{name} {description}".lower()
    if any(keyword in haystack for keyword in DESTRUCTIVE_KEYWORDS):
        return "destructive"
    if any(keyword in haystack for keyword in EXTERNAL_KEYWORDS):
        return "external"
    if any(keyword in haystack for keyword in WRITE_KEYWORDS):
        return "write"
    if any(keyword in haystack for keyword in READ_KEYWORDS):
        return "read"

    schema_text = str(input_schema or {}).lower()
    if "mutation" in schema_text or "write" in schema_text:
        return "write"
    return "external"


def default_permission_for_risk(risk_level: RiskLevel) -> PermissionMode:
    if risk_level in {"destructive", "write", "external"}:
        return "require_approval"
    return "auto"
