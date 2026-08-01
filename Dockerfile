# syntax=docker/dockerfile:1

FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS frontend-build
WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_MODE=hosted \
    FRONTEND_DIST_DIR=/app/frontend/dist \
    MCP_COMPOSER_DOCS_ENABLED=false \
    MCP_COMPOSER_REQUIRE_ORIGIN=true

WORKDIR /app/backend

RUN groupadd --system --gid 10001 composer \
    && useradd --system --uid 10001 --gid composer --create-home composer

COPY backend/requirements.txt ./
RUN python -m pip install \
    --no-cache-dir \
    --disable-pip-version-check \
    --require-hashes \
    -r requirements.txt

COPY --chown=composer:composer backend/app ./app
COPY --from=frontend-build --chown=composer:composer /build/frontend/dist /app/frontend/dist

USER composer

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
