#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
USER_HOME_DIR=${HOME:?HOME is required}
DATA_BASE_DIR=${XDG_DATA_HOME:-${USER_HOME_DIR}/.local/share}
CONFIG_BASE_DIR=${XDG_CONFIG_HOME:-${USER_HOME_DIR}/.config}
INSTALL_DIR=${DATA_BASE_DIR}/mcp-composer/runtime
RUNTIME=${INSTALL_DIR}/mcp-composer.sh
[[ -x ${RUNTIME} ]] || RUNTIME=${SCRIPT_DIR}/mcp-composer.sh
"${RUNTIME}" uninstall "$@"

if command -v systemctl >/dev/null 2>&1; then
    systemctl --user disable --now mcp-composer.service >/dev/null 2>&1 || true
    rm -f -- "${CONFIG_BASE_DIR}/systemd/user/mcp-composer.service"
    systemctl --user daemon-reload >/dev/null 2>&1 || true
fi

rm -f -- \
    "${INSTALL_DIR}/mcp-composer.sh" \
    "${INSTALL_DIR}/compose.release.yaml" \
    "${INSTALL_DIR}/VERSION"
rmdir -- "${INSTALL_DIR}" 2>/dev/null || true
rmdir -- "${DATA_BASE_DIR}/mcp-composer" 2>/dev/null || true
printf 'Removed the installed MCP Composer launcher.\n'
