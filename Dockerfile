# syntax=docker/dockerfile:1

ARG MCP_COMPOSER_VERSION=0.1.0

FROM --platform=$BUILDPLATFORM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS frontend-build
ARG MCP_COMPOSER_VERSION
ENV VITE_APP_VERSION=${MCP_COMPOSER_VERSION}
WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS node-runtime

FROM python:3.12-slim@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de AS runtime
ARG MCP_COMPOSER_VERSION

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NPM_CONFIG_CACHE=/tmp/npm-cache \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    MCP_COMPOSER_VERSION=${MCP_COMPOSER_VERSION} \
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

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && node --version \
    && npx --version

COPY --chown=composer:composer backend/app ./app
COPY --from=frontend-build --chown=composer:composer /build/frontend/dist /app/frontend/dist

USER composer

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
