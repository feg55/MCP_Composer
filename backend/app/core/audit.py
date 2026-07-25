from __future__ import annotations

from uuid import uuid4

from app.core.types import AuditLogEntry, LogSeverity, utc_now_iso


def create_audit_entry(
    entry_type: str, message: str, severity: LogSeverity = "info"
) -> AuditLogEntry:
    return AuditLogEntry(
        id=str(uuid4()),
        timestamp=utc_now_iso(),
        type=entry_type,
        message=message,
        severity=severity,
    )
