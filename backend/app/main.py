from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.api.routes_catalog import router as catalog_router
from app.api.routes_composition import router as composition_router
from app.api.routes_gateway import router as gateway_router
from app.api.routes_proxy import router as proxy_router
from app.core.settings import Settings, get_settings

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
JSON_CONTENT_TYPES = {"application/json"}


class RequestBodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_request_bytes: int) -> None:
        self.app = app
        self.max_request_bytes = max_request_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope.get("method") not in UNSAFE_METHODS
            or not scope.get("path", "").startswith("/api/")
        ):
            await self.app(scope, receive, send)
            return

        received_bytes = 0
        body_chunks: list[bytes] = []
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            received_bytes += len(chunk)
            if received_bytes > self.max_request_bytes:
                response = JSONResponse(
                    status_code=413,
                    content={"detail": "Request body is too large."},
                )
                await response(scope, receive, send)
                return
            body_chunks.append(chunk)
            if not message.get("more_body", False):
                break

        body = b"".join(body_chunks)
        body_replayed = False

        async def replay_receive() -> Message:
            nonlocal body_replayed
            if body_replayed:
                return {"type": "http.disconnect"}
            body_replayed = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, replay_receive, send)


class RequestSecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: FastAPI, settings: Settings) -> None:
        super().__init__(app)
        self.settings = settings

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        rejection = self._validate_request(request)
        if rejection is not None:
            response: Response = rejection
        else:
            response = await call_next(request)
        self._apply_headers(request, response)
        return response

    def _validate_request(self, request: Request) -> JSONResponse | None:
        if not request.url.path.startswith("/api/"):
            return None
        if request.method not in UNSAFE_METHODS:
            return None

        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self.settings.max_request_bytes:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Request body is too large."},
                    )
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={"detail": "Content-Length is invalid."},
                )

        content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if content_type not in JSON_CONTENT_TYPES:
            return JSONResponse(
                status_code=415,
                content={"detail": "State-changing API requests require application/json."},
            )

        origin = request.headers.get("origin", "").rstrip("/")
        fetch_site = request.headers.get("sec-fetch-site", "").lower()
        browser_request = bool(fetch_site)
        if origin and origin not in self.settings.allowed_origins:
            return JSONResponse(status_code=403, content={"detail": "Origin is not allowed."})
        if self.settings.require_origin and not origin:
            return JSONResponse(status_code=403, content={"detail": "Origin header is required."})
        if browser_request and not origin:
            return JSONResponse(
                status_code=403, content={"detail": "Browser request is missing Origin."}
            )
        if (
            fetch_site in {"cross-site", "same-site"}
            and origin not in self.settings.allowed_origins
        ):
            return JSONResponse(
                status_code=403, content={"detail": "Cross-site request is not allowed."}
            )
        return None

    def _apply_headers(self, request: Request, response: Response) -> None:
        interactive_docs = self.settings.docs_enabled and request.url.path in {
            "/docs",
            "/redoc",
        }
        if not interactive_docs:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "base-uri 'self'; "
                "frame-ancestors 'none'; "
                "form-action 'self'; "
                "script-src 'self'; "
                "style-src 'self'; "
                "img-src 'self' data:; "
                "font-src 'self' data:; "
                "connect-src 'self'"
            )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        )
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        elif request.url.path.startswith("/assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif response.headers.get("content-type", "").startswith("text/html"):
            response.headers["Cache-Control"] = "no-cache"
        if self.settings.hosted:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"


def _add_frontend_routes(app: FastAPI, dist_dir: Path) -> None:
    if not dist_dir.is_dir() or not (dist_dir / "index.html").is_file():
        raise ValueError(
            "FRONTEND_DIST_DIR must point to a Vite dist directory containing index.html."
        )
    root = dist_dir.resolve()

    @app.api_route(
        "/{frontend_path:path}",
        methods=["GET", "HEAD"],
        include_in_schema=False,
    )
    async def frontend(frontend_path: str, request: Request) -> FileResponse:
        reserved = {"api", "docs", "redoc", "openapi.json"}
        first_segment = frontend_path.split("/", 1)[0]
        if first_segment in reserved:
            raise HTTPException(status_code=404, detail="Not found.")

        candidate = (root / frontend_path).resolve()
        if candidate.is_relative_to(root) and candidate.is_file():
            return FileResponse(candidate)

        accepts_html = frontend_path == "" or "text/html" in request.headers.get("accept", "")
        if not accepts_html:
            raise HTTPException(status_code=404, detail="Not found.")
        return FileResponse(root / "index.html")


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or get_settings()
    docs_url = "/docs" if resolved.docs_enabled else None
    redoc_url = "/redoc" if resolved.docs_enabled else None
    openapi_url = "/openapi.json" if resolved.docs_enabled else None
    application = FastAPI(
        title="MCP Composer API",
        version=resolved.app_version,
        description="Builder API for composing multiple MCP servers into a single gateway configuration.",
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
    )
    application.state.settings = resolved
    application.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=list(resolved.allowed_hosts),
    )
    application.add_middleware(
        RequestBodyLimitMiddleware,
        max_request_bytes=resolved.max_request_bytes,
    )
    application.add_middleware(RequestSecurityMiddleware, settings=resolved)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Accept", "Authorization", "Content-Type"],
    )

    application.include_router(catalog_router)
    application.include_router(composition_router)
    application.include_router(gateway_router)
    application.include_router(proxy_router)

    @application.get("/api/health")
    async def health() -> dict[str, str]:
        return {
            "status": "ok",
            "service": "mcp-composer-api",
            "mode": resolved.app_mode,
            "version": resolved.app_version,
        }

    if resolved.frontend_dist_dir is not None:
        _add_frontend_routes(application, resolved.frontend_dist_dir)
    return application


app = create_app()
