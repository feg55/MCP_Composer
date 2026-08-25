#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
if [[ -f "${SCRIPT_DIR}/compose.release.yaml" ]]; then
    BUNDLE_DIR=${SCRIPT_DIR}
elif [[ -f "${SCRIPT_DIR}/../../compose.release.yaml" ]]; then
    BUNDLE_DIR=$(cd -- "${SCRIPT_DIR}/../.." && pwd -P)
else
    printf 'Error: compose.release.yaml was not found next to the release launcher.\n' >&2
    exit 1
fi

USER_HOME_DIR=${HOME:?HOME is required}
CONFIG_BASE_DIR=${XDG_CONFIG_HOME:-${USER_HOME_DIR}/.config}
DATA_BASE_DIR=${XDG_DATA_HOME:-${USER_HOME_DIR}/.local/share}
CONFIG_DIR=${CONFIG_BASE_DIR}/mcp-composer
CONFIG_FILE=${CONFIG_DIR}/composer.env
INSTALL_DIR=${DATA_BASE_DIR}/mcp-composer/runtime
COMPOSE_FILE=${BUNDLE_DIR}/compose.release.yaml
VERSION_FILE=${BUNDLE_DIR}/VERSION
PROJECT_NAME=mcp-composer
OPEN_BROWSER=0
PURGE_CONFIG=0
REQUESTED_PORT=
REQUESTED_VERSION=

die() {
    printf 'Error: %s\n' "$*" >&2
    exit 1
}

bundle_version() {
    if [[ -f "${VERSION_FILE}" ]]; then
        tr -d '[:space:]' <"${VERSION_FILE}" | sed 's/^v//'
    else
        printf '0.1.0'
    fi
}

assert_version() {
    [[ $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] || die "Invalid release version: $1"
}

assert_port() {
    [[ $1 =~ ^[0-9]+$ ]] || die "Port must be numeric."
    ((10#$1 >= 1 && 10#$1 <= 65535)) || die "Port must be between 1 and 65535."
}

initialize_config() {
    [[ -f "${CONFIG_FILE}" ]] && return
    local initial_version
    initial_version=$(bundle_version)
    assert_version "${initial_version}"
    mkdir -p -- "${CONFIG_DIR}"
    umask 077
    printf '%s\n' \
        "MCP_COMPOSER_VERSION=${initial_version}" \
        'MCP_COMPOSER_IMAGE=ghcr.io/feg55/mcp-composer' \
        'MCP_COMPOSER_PORT=8000' >"${CONFIG_FILE}"
    printf 'Created configuration: %s\n' "${CONFIG_FILE}"
}

config_value() {
    local key=$1 fallback=$2 value
    value=$(sed -n "s/^${key}=//p" "${CONFIG_FILE}" | tail -n 1 | tr -d '\r')
    printf '%s' "${value:-${fallback}}"
}

set_config_value() {
    local key=$1 value=$2 temp_file
    temp_file=$(mktemp "${CONFIG_DIR}/.composer.env.XXXXXX")
    awk -v key="${key}" -v value="${value}" '
        BEGIN { found = 0 }
        index($0, key "=") == 1 { print key "=" value; found = 1; next }
        { print }
        END { if (!found) print key "=" value }
    ' "${CONFIG_FILE}" >"${temp_file}"
    chmod 600 "${temp_file}"
    mv -f -- "${temp_file}" "${CONFIG_FILE}"
}

assert_docker() {
    command -v docker >/dev/null 2>&1 || die "Docker was not found. Install Docker Engine and the Compose v2 plugin."
    docker info >/dev/null 2>&1 || die "Docker is installed but its engine is not running or is not accessible."
    docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required."
}

sync_compose_environment() {
    MCP_COMPOSER_VERSION=$(config_value MCP_COMPOSER_VERSION "$(bundle_version)")
    MCP_COMPOSER_PORT=$(config_value MCP_COMPOSER_PORT 8000)
    MCP_COMPOSER_IMAGE=$(config_value MCP_COMPOSER_IMAGE ghcr.io/feg55/mcp-composer)
    assert_version "${MCP_COMPOSER_VERSION}"
    assert_port "${MCP_COMPOSER_PORT}"
    export MCP_COMPOSER_VERSION MCP_COMPOSER_PORT MCP_COMPOSER_IMAGE
}

compose() {
    docker compose \
        --project-name "${PROJECT_NAME}" \
        --env-file "${CONFIG_FILE}" \
        -f "${COMPOSE_FILE}" \
        "$@"
}

wait_for_health() {
    local base_url=$1 attempt
    for ((attempt = 1; attempt <= 30; attempt++)); do
        if curl --fail --silent --show-error --max-time 3 "${base_url}/api/health" \
            | grep --fixed-strings '"service":"mcp-composer-api"' >/dev/null; then
            return
        fi
        sleep 1
    done
    die "MCP Composer did not become healthy at ${base_url}."
}

open_browser() {
    local url=$1
    if ((OPEN_BROWSER != 1)); then
        return 0
    fi
    if [[ -z ${DISPLAY:-} && -z ${WAYLAND_DISPLAY:-} ]]; then
        printf 'No graphical session detected; browser was not opened.\n'
        return
    fi
    command -v xdg-open >/dev/null 2>&1 || die "xdg-open is required for --open-browser."
    xdg-open "${url}" >/dev/null 2>&1 &
}

usage() {
    printf '%s\n' \
        'Usage: mcp-composer.sh ACTION [OPTIONS]' \
        '' \
        'Actions: start, stop, update, logs, status, uninstall' \
        'Options:' \
        '  --port PORT       Set the loopback HTTP port.' \
        '  --version VERSION Pin a specific image version.' \
        '  --open-browser    Open the UI when a graphical session exists.' \
        '  --purge-config    Remove configuration during uninstall.'
}

if [[ ${1:-} == -h || ${1:-} == --help ]]; then
    usage
    exit 0
fi

ACTION=${1:-start}
[[ $# -gt 0 ]] && shift
while [[ $# -gt 0 ]]; do
    case $1 in
        --port)
            [[ $# -ge 2 ]] || die "--port requires a value."
            REQUESTED_PORT=$2
            shift 2
            ;;
        --version)
            [[ $# -ge 2 ]] || die "--version requires a value."
            REQUESTED_VERSION=${2#v}
            shift 2
            ;;
        --open-browser)
            OPEN_BROWSER=1
            shift
            ;;
        --purge-config)
            PURGE_CONFIG=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            die "Unknown option: $1"
            ;;
    esac
done

case ${ACTION} in
    start|stop|update|logs|status|uninstall) ;;
    *)
        usage
        die "Unknown action: ${ACTION}"
        ;;
esac

assert_docker
if [[ ${ACTION} == start || ${ACTION} == update ]]; then
    command -v curl >/dev/null 2>&1 || die "curl is required for the health check."
fi
initialize_config

if [[ -n ${REQUESTED_PORT} ]]; then
    assert_port "${REQUESTED_PORT}"
    set_config_value MCP_COMPOSER_PORT "${REQUESTED_PORT}"
fi
if [[ -n ${REQUESTED_VERSION} ]]; then
    assert_version "${REQUESTED_VERSION}"
    set_config_value MCP_COMPOSER_VERSION "${REQUESTED_VERSION}"
elif [[ ${ACTION} == update ]]; then
    RELEASE_VERSION=$(bundle_version)
    assert_version "${RELEASE_VERSION}"
    set_config_value MCP_COMPOSER_VERSION "${RELEASE_VERSION}"
fi

sync_compose_environment
BASE_URL=http://127.0.0.1:${MCP_COMPOSER_PORT}

case ${ACTION} in
    start)
        if ! compose up --detach --pull always --wait --wait-timeout 120; then
            compose logs --tail 80 composer || true
            die "Container startup failed. Check Docker access, registry access, and whether port ${MCP_COMPOSER_PORT} is already in use."
        fi
        wait_for_health "${BASE_URL}"
        printf 'MCP Composer %s is running at %s\n' "${MCP_COMPOSER_VERSION}" "${BASE_URL}"
        printf 'Remote access: ssh -L %s:127.0.0.1:%s USER@SERVER\n' "${MCP_COMPOSER_PORT}" "${MCP_COMPOSER_PORT}"
        open_browser "${BASE_URL}"
        ;;
    stop)
        compose down --remove-orphans
        printf 'MCP Composer stopped. Configuration was preserved.\n'
        ;;
    update)
        compose pull composer
        compose up --detach --wait --wait-timeout 120
        wait_for_health "${BASE_URL}"
        printf 'MCP Composer updated to %s.\n' "${MCP_COMPOSER_VERSION}"
        ;;
    logs)
        compose logs --follow composer
        ;;
    status)
        compose ps
        ;;
    uninstall)
        compose down --remove-orphans
        if ((PURGE_CONFIG == 1)); then
            rm -f -- "${CONFIG_FILE}"
            rmdir -- "${CONFIG_DIR}" 2>/dev/null || true
            printf 'Removed MCP Composer configuration.\n'
        else
            printf 'Containers removed. Configuration was preserved. Add --purge-config to remove it.\n'
        fi
        ;;
esac
