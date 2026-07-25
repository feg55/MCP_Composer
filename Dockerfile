# syntax=docker/dockerfile:1

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS frontend-build
WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM python:3.14-slim@sha256:cea0e6040540fb2b965b6e7fb5ffa00871e632eef63719f0ea54bca189ce14a6 AS runtime

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
