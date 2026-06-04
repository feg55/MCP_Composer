from __future__ import annotations

from mcp.server.fastmcp import FastMCP


mcp = FastMCP("Simple Test MCP")


@mcp.tool()
def echo(message: str) -> str:
    """Echo a message back to the caller."""
    return message


@mcp.tool()
def add(left: int, right: int) -> int:
    """Add two integers."""
    return left + right


if __name__ == "__main__":
    mcp.run()
