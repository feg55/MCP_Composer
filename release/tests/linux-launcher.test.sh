#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
REPOSITORY_DIR=$(cd -- "${SCRIPT_DIR}/../.." && pwd -P)
TEST_BASE_DIR=${MCP_COMPOSER_TEST_TMPDIR:-${TMPDIR:-/tmp}}
mkdir -p -- "${TEST_BASE_DIR}"
TEST_DIR=$(mktemp -d "${TEST_BASE_DIR%/}/mcp-composer-launcher.XXXXXX")
export XDG_CONFIG_HOME=${TEST_DIR}/config
export XDG_DATA_HOME=${TEST_DIR}/data
export MCP_COMPOSER_TEST_DOCKER_LOG=${TEST_DIR}/docker.log

cleanup() {
    rm -rf -- "${TEST_DIR}"
}
trap cleanup EXIT

docker() {
    printf '%s\n' "$*" >>"${MCP_COMPOSER_TEST_DOCKER_LOG}"
    if [[ ${MCP_COMPOSER_MOCK_RUNNING_PROJECT:-0} == 1 && ${1:-} == ps ]]; then
        case $* in
            *'--format {{.ID}}'*) printf '%s\n' old-container-id ;;
            *'--format {{.Ports}}'*) printf '%s\n' '127.0.0.1:18080->8000/tcp' ;;
            *'--format {{.Image}}'*) printf '%s\n' 'ghcr.io/feg55/mcp-composer:0.1.0' ;;
        esac
    fi
    return 0
}

curl() {
    printf '%s' '{"status":"ok","service":"mcp-composer-api","mode":"local","version":"0.1.0"}'
}

export -f docker curl

LAUNCHER=${REPOSITORY_DIR}/release/linux/mcp-composer.sh
bash "${LAUNCHER}" start --port 18080 --version 0.1.0
grep --fixed-strings 'MCP_COMPOSER_PORT=18080' "${XDG_CONFIG_HOME}/mcp-composer/composer.env"
grep --fixed-strings 'up --detach --pull missing --wait --wait-timeout 120' "${MCP_COMPOSER_TEST_DOCKER_LOG}"

export MCP_COMPOSER_MOCK_RUNNING_PROJECT=1
: >"${MCP_COMPOSER_TEST_DOCKER_LOG}"
bash "${LAUNCHER}" start
grep --fixed-strings 'MCP_COMPOSER_VERSION=0.1.7' "${XDG_CONFIG_HOME}/mcp-composer/composer.env"
grep --fixed-strings 'up --detach --pull missing --wait --wait-timeout 120' "${MCP_COMPOSER_TEST_DOCKER_LOG}"
export MCP_COMPOSER_MOCK_RUNNING_PROJECT=0

bash "${LAUNCHER}" update --version 0.1.0
grep --fixed-strings 'pull composer' "${MCP_COMPOSER_TEST_DOCKER_LOG}"

bash "${LAUNCHER}" status
bash "${LAUNCHER}" stop
bash "${LAUNCHER}" uninstall --purge-config
[[ ! -e "${XDG_CONFIG_HOME}/mcp-composer/composer.env" ]]
