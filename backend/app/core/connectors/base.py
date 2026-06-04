from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.core.types import McpServerDefinition, McpToolDefinition, TestConnectionResponse


class McpConnector(ABC):
    """Replaceable interface for real MCP SDK-backed connectors."""

    @abstractmethod
    async def list_tools(self, server: McpServerDefinition) -> list[McpToolDefinition]:
        raise NotImplementedError

    @abstractmethod
    async def test_connection(self, server: McpServerDefinition) -> TestConnectionResponse:
        raise NotImplementedError

    @abstractmethod
    async def call_tool(
        self,
        server: McpServerDefinition,
        tool: McpToolDefinition,
        input_payload: dict[str, Any],
    ) -> dict[str, Any]:
        raise NotImplementedError
