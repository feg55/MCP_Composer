#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
REPOSITORY_DIR=$(cd -- "${SCRIPT_DIR}/../.." && pwd -P)
BUNDLE_DIR=${MCP_COMPOSER_E2E_BUNDLE_DIR:-${REPOSITORY_DIR}}
IMAGE=${MCP_COMPOSER_E2E_IMAGE:-mcp-composer}
VERSION=${MCP_COMPOSER_E2E_VERSION:-0.1.5}
REQUESTED_OCCUPIED_PORT=${MCP_COMPOSER_E2E_OCCUPIED_PORT:-0}
TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/mcp-composer-linux-e2e.XXXXXX")
PROJECT_NAME=mcp-composer-e2e-linux-$(printf '%s' "${RANDOM}${RANDOM}" | tr -cd '0-9')
BLOCKER_NAME=mcp-composer-e2e-blocker-$(printf '%s' "${RANDOM}${RANDOM}" | tr -cd '0-9')

if [[ -x ${BUNDLE_DIR}/mcp-composer.sh ]]; then
    LAUNCHER=${BUNDLE_DIR}/mcp-composer.sh
else
    LAUNCHER=${REPOSITORY_DIR}/release/linux/mcp-composer.sh
fi
COMPOSE_FILE=${BUNDLE_DIR}/compose.release.yaml

export XDG_CONFIG_HOME=${TEST_DIR}/config
export XDG_DATA_HOME=${TEST_DIR}/data
export MCP_COMPOSER_LAUNCHER_PROJECT_NAME=${PROJECT_NAME}
CONFIG_DIR=${XDG_CONFIG_HOME}/mcp-composer
CONFIG_FILE=${CONFIG_DIR}/composer.env

cleanup() {
    MCP_COMPOSER_IMAGE=${IMAGE} \
    MCP_COMPOSER_VERSION=${VERSION} \
    MCP_COMPOSER_PORT=8000 \
        docker compose \
        --project-name "${PROJECT_NAME}" \
        -f "${COMPOSE_FILE}" \
        down --remove-orphans >/dev/null 2>&1 || true
    docker rm --force "${BLOCKER_NAME}" >/dev/null 2>&1 || true
    rm -rf -- "${TEST_DIR}"
}
trap cleanup EXIT

IMAGE_REFERENCE=${IMAGE}:${VERSION}
PUBLISH_SPEC=127.0.0.1::8000
if [[ ${REQUESTED_OCCUPIED_PORT} != 0 ]]; then
    PUBLISH_SPEC=127.0.0.1:${REQUESTED_OCCUPIED_PORT}:8000
fi
BLOCKER_ID=$(docker run \
    --detach \
    --rm \
    --name "${BLOCKER_NAME}" \
    --pull never \
    --publish "${PUBLISH_SPEC}" \
    "${IMAGE_REFERENCE}" \
    python -m http.server 8000)
[[ -n ${BLOCKER_ID} ]] || {
    printf 'Failed to start the occupied-port Docker fixture.\n' >&2
    exit 1
}
OCCUPIED_PORT=$(docker port "${BLOCKER_NAME}" 8000/tcp | sed -n 's/^127\.0\.0\.1://p' | head -n 1)
[[ ${OCCUPIED_PORT} =~ ^[0-9]+$ ]] || {
    printf 'Failed to determine the occupied Docker port.\n' >&2
    exit 1
}

mkdir -p -- "${CONFIG_DIR}"
printf '%s\n' \
    "MCP_COMPOSER_VERSION=${VERSION}" \
    "MCP_COMPOSER_IMAGE=${IMAGE}" \
    "MCP_COMPOSER_PORT=${OCCUPIED_PORT}" >"${CONFIG_FILE}"

bash "${LAUNCHER}" start
SELECTED_PORT=$(sed -n 's/^MCP_COMPOSER_PORT=//p' "${CONFIG_FILE}" | tail -n 1)
[[ ${SELECTED_PORT} != "${OCCUPIED_PORT}" ]] || {
    printf 'The Linux launcher did not replace an occupied port.\n' >&2
    exit 1
}

BASE_URL=http://127.0.0.1:${SELECTED_PORT}
HEALTH=$(curl --fail --silent --show-error "${BASE_URL}/api/health")
printf '%s' "${HEALTH}" | grep --fixed-strings '"status":"ok"' >/dev/null
printf '%s' "${HEALTH}" | grep --fixed-strings '"service":"mcp-composer-api"' >/dev/null
printf '%s' "${HEALTH}" | grep --fixed-strings "\"version\":\"${VERSION}\"" >/dev/null
curl --fail --silent --show-error "${BASE_URL}/" \
    | grep --fixed-strings '<div id="root"></div>' >/dev/null

GITHUB_PAYLOAD=${TEST_DIR}/github-server.json
printf '%s' '{
  "id": "github-mcp",
  "name": "GitHub MCP",
  "description": "Official remote GitHub MCP.",
  "transport": "http",
  "source": "official",
  "command": null,
  "args": [],
  "url": "https://api.githubcopilot.com/mcp/",
  "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"},
  "headers": {"Authorization": "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}"},
  "status": "needs_auth",
  "tools": []
}' >"${GITHUB_PAYLOAD}"
MISSING_CREDENTIAL=$(curl --fail --silent --show-error \
    --request POST \
    --header 'Content-Type: application/json' \
    --data-binary "@${GITHUB_PAYLOAD}" \
    "${BASE_URL}/api/test-connection")
printf '%s' "${MISSING_CREDENTIAL}" | grep --fixed-strings '"status":"needs_auth"' >/dev/null
printf '%s' "${MISSING_CREDENTIAL}" \
    | grep --fixed-strings 'GITHUB_PERSONAL_ACCESS_TOKEN' >/dev/null

GITHUB_INVALID_PAYLOAD=${TEST_DIR}/github-server-invalid.json
printf '%s' '{
  "id": "github-mcp",
  "name": "GitHub MCP",
  "description": "Official remote GitHub MCP.",
  "transport": "http",
  "source": "official",
  "command": null,
  "args": [],
  "url": "https://api.githubcopilot.com/mcp/",
  "env": {"GITHUB_PERSONAL_ACCESS_TOKEN": "github_pat_intentionally_invalid_for_e2e"},
  "headers": {"Authorization": "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}"},
  "status": "needs_auth",
  "tools": []
}' >"${GITHUB_INVALID_PAYLOAD}"
INVALID_CREDENTIAL=$(curl --fail --silent --show-error \
    --request POST \
    --header 'Content-Type: application/json' \
    --data-binary "@${GITHUB_INVALID_PAYLOAD}" \
    "${BASE_URL}/api/test-connection")
printf '%s' "${INVALID_CREDENTIAL}" | grep --fixed-strings '"status":"needs_auth"' >/dev/null
printf '%s' "${INVALID_CREDENTIAL}" \
    | grep --fixed-strings 'Authentication failed. Check the configured credentials.' >/dev/null

mapfile -t CONTAINER_IDS < <(docker ps \
    --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
    --filter 'label=com.docker.compose.service=composer' \
    --format '{{.ID}}')
[[ ${#CONTAINER_IDS[@]} -eq 1 ]] || {
    printf 'Expected exactly one Linux E2E container, found %s.\n' "${#CONTAINER_IDS[@]}" >&2
    exit 1
}
CONTAINER_ID=${CONTAINER_IDS[0]}
[[ $(docker inspect --format '{{.Config.User}}' "${CONTAINER_ID}") == composer ]]
[[ $(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "${CONTAINER_ID}") == true ]]
docker exec "${CONTAINER_ID}" npx --version >/dev/null

docker exec --interactive "${CONTAINER_ID}" sh -c 'cat > /tmp/simple_mcp_server.py' \
    <"${REPOSITORY_DIR}/backend/tests/fixtures/simple_mcp_server.py"
CATALOG_PAYLOAD=${TEST_DIR}/catalog-server.json
printf '%s' '{
  "id": "fixture-catalog-mcp",
  "name": "Fixture Catalog MCP",
  "description": "Real stdio MCP fixture with catalog metadata.",
  "transport": "stdio",
  "source": "registry",
  "command": "python",
  "args": ["/tmp/simple_mcp_server.py"],
  "url": null,
  "env": {},
  "tags": ["test"],
  "status": "ready",
  "tools": [],
  "catalogSources": ["registry"],
  "repositoryUrl": "https://github.com/example/fixture-mcp",
  "homepageUrl": null,
  "packageId": "@example/fixture-mcp",
  "remoteUrl": null,
  "installHint": "python /tmp/simple_mcp_server.py",
  "externalUrl": "https://github.com/example/fixture-mcp",
  "verified": true,
  "popularity": 100
}' >"${CATALOG_PAYLOAD}"
CONNECTION=$(curl --fail --silent --show-error \
    --request POST \
    --header 'Content-Type: application/json' \
    --data-binary "@${CATALOG_PAYLOAD}" \
    "${BASE_URL}/api/test-connection")
printf '%s' "${CONNECTION}" | grep --fixed-strings '"status":"ready"' >/dev/null
DISCOVERY=$(curl --fail --silent --show-error \
    --request POST \
    --header 'Content-Type: application/json' \
    --data-binary "@${CATALOG_PAYLOAD}" \
    "${BASE_URL}/api/discover-tools")
printf '%s' "${DISCOVERY}" | grep --fixed-strings '"status":"ready"' >/dev/null
printf '%s' "${DISCOVERY}" | grep --fixed-strings '"originalName":"echo"' >/dev/null

FILESYSTEM_PAYLOAD=${TEST_DIR}/filesystem-server.json
printf '%s' '{
  "id": "filesystem-mcp",
  "name": "Filesystem MCP",
  "description": "Real npm catalog MCP.",
  "transport": "stdio",
  "source": "registry",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  "url": null,
  "env": {},
  "tags": ["files"],
  "status": "ready",
  "tools": [],
  "catalogSources": ["registry"],
  "repositoryUrl": "https://github.com/modelcontextprotocol/servers",
  "homepageUrl": null,
  "packageId": "@modelcontextprotocol/server-filesystem",
  "remoteUrl": null,
  "installHint": "npx -y @modelcontextprotocol/server-filesystem /tmp",
  "externalUrl": "https://github.com/modelcontextprotocol/servers",
  "verified": true,
  "popularity": 100
}' >"${FILESYSTEM_PAYLOAD}"
FILESYSTEM_CONNECTION=$(curl --fail --silent --show-error \
    --request POST \
    --header 'Content-Type: application/json' \
    --data-binary "@${FILESYSTEM_PAYLOAD}" \
    "${BASE_URL}/api/test-connection")
printf '%s' "${FILESYSTEM_CONNECTION}" | grep --fixed-strings '"status":"ready"' >/dev/null
FILESYSTEM_DISCOVERY=$(curl --fail --silent --show-error \
    --request POST \
    --header 'Content-Type: application/json' \
    --data-binary "@${FILESYSTEM_PAYLOAD}" \
    "${BASE_URL}/api/discover-tools")
printf '%s' "${FILESYSTEM_DISCOVERY}" | grep --fixed-strings '"status":"ready"' >/dev/null
printf '%s' "${FILESYSTEM_DISCOVERY}" | grep --fixed-strings '"originalName":"read_file"' >/dev/null

bash "${LAUNCHER}" start
mapfile -t REPEATED_CONTAINER_IDS < <(docker ps \
    --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
    --filter 'label=com.docker.compose.service=composer' \
    --format '{{.ID}}')
[[ ${#REPEATED_CONTAINER_IDS[@]} -eq 1 && ${REPEATED_CONTAINER_IDS[0]} == "${CONTAINER_ID}" ]] || {
    printf 'Repeated Linux start created or replaced the running container.\n' >&2
    exit 1
}

bash "${LAUNCHER}" status
bash "${LAUNCHER}" stop
[[ -z $(docker ps \
    --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
    --filter 'label=com.docker.compose.service=composer' \
    --format '{{.ID}}') ]]
bash "${LAUNCHER}" uninstall --purge-config
[[ ! -e ${CONFIG_FILE} ]]
