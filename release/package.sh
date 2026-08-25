#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
REPOSITORY_DIR=$(cd -- "${SCRIPT_DIR}/.." && pwd -P)
VERSION=${1:-$(tr -d '[:space:]' <"${REPOSITORY_DIR}/VERSION")}
OUTPUT_DIR=${2:?Output directory is required}

[[ ${VERSION} =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] || {
    printf 'Invalid release version: %s\n' "${VERSION}" >&2
    exit 1
}

WINDOWS_DIR=${OUTPUT_DIR}/mcp-composer-${VERSION}-windows
LINUX_DIR=${OUTPUT_DIR}/mcp-composer-${VERSION}-linux
mkdir -p -- "${WINDOWS_DIR}/hosted" "${LINUX_DIR}/hosted"

cp \
    "${REPOSITORY_DIR}/VERSION" \
    "${REPOSITORY_DIR}/compose.release.yaml" \
    "${REPOSITORY_DIR}/RELEASE.md" \
    "${WINDOWS_DIR}/"
cp "${REPOSITORY_DIR}"/release/windows/* "${WINDOWS_DIR}/"
cp \
    "${REPOSITORY_DIR}/compose.hosted.yaml" \
    "${REPOSITORY_DIR}/Caddyfile" \
    "${REPOSITORY_DIR}/.env.hosted.example" \
    "${WINDOWS_DIR}/hosted/"

cp \
    "${REPOSITORY_DIR}/VERSION" \
    "${REPOSITORY_DIR}/compose.release.yaml" \
    "${REPOSITORY_DIR}/RELEASE.md" \
    "${LINUX_DIR}/"
cp "${REPOSITORY_DIR}"/release/linux/* "${LINUX_DIR}/"
cp \
    "${REPOSITORY_DIR}/compose.hosted.yaml" \
    "${REPOSITORY_DIR}/Caddyfile" \
    "${REPOSITORY_DIR}/.env.hosted.example" \
    "${LINUX_DIR}/hosted/"
chmod 0755 "${LINUX_DIR}"/*.sh

cd -- "${OUTPUT_DIR}"
zip -q -r "mcp-composer-${VERSION}-windows.zip" "$(basename -- "${WINDOWS_DIR}")"
tar -czf "mcp-composer-${VERSION}-linux.tar.gz" "$(basename -- "${LINUX_DIR}")"
sha256sum \
    "mcp-composer-${VERSION}-windows.zip" \
    "mcp-composer-${VERSION}-linux.tar.gz" \
    >"mcp-composer-${VERSION}-checksums.txt"
