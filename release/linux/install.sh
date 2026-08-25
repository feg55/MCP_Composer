#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
if [[ -f "${SCRIPT_DIR}/compose.release.yaml" ]]; then
    BUNDLE_DIR=${SCRIPT_DIR}
elif [[ -f "${SCRIPT_DIR}/../../compose.release.yaml" ]]; then
    BUNDLE_DIR=$(cd -- "${SCRIPT_DIR}/../.." && pwd -P)
else
    printf 'Error: compose.release.yaml was not found.\n' >&2
    exit 1
fi

USER_HOME_DIR=${HOME:?HOME is required}
DATA_BASE_DIR=${XDG_DATA_HOME:-${USER_HOME_DIR}/.local/share}
CONFIG_BASE_DIR=${XDG_CONFIG_HOME:-${USER_HOME_DIR}/.config}
INSTALL_DIR=${DATA_BASE_DIR}/mcp-composer/runtime
SYSTEMD_DIR=${CONFIG_BASE_DIR}/systemd/user
SYSTEMD_UNIT=${SYSTEMD_DIR}/mcp-composer.service
ENABLE_SYSTEMD=0
NO_START=0
FORWARD_ARGS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --systemd)
            ENABLE_SYSTEMD=1
            shift
            ;;
        --no-start)
            NO_START=1
            shift
            ;;
        *)
            FORWARD_ARGS+=("$1")
            shift
            ;;
    esac
done

mkdir -p -- "${INSTALL_DIR}"
install -m 0755 "${SCRIPT_DIR}/mcp-composer.sh" "${INSTALL_DIR}/mcp-composer.sh"
install -m 0644 "${BUNDLE_DIR}/compose.release.yaml" "${INSTALL_DIR}/compose.release.yaml"
install -m 0644 "${BUNDLE_DIR}/VERSION" "${INSTALL_DIR}/VERSION"
printf 'Installed MCP Composer launcher in %s\n' "${INSTALL_DIR}"

if ((ENABLE_SYSTEMD == 1)); then
    command -v systemctl >/dev/null 2>&1 || {
        printf 'Error: systemctl is required for --systemd.\n' >&2
        exit 1
    }
    mkdir -p -- "${SYSTEMD_DIR}"
    printf '%s\n' \
        '[Unit]' \
        'Description=MCP Composer container launcher' \
        'Wants=network-online.target' \
        'After=network-online.target' \
        '' \
        '[Service]' \
        'Type=oneshot' \
        'RemainAfterExit=yes' \
        'Restart=on-failure' \
        'RestartSec=5' \
        "ExecStart=\"${INSTALL_DIR}/mcp-composer.sh\" start" \
        "ExecStop=\"${INSTALL_DIR}/mcp-composer.sh\" stop" \
        'TimeoutStartSec=180' \
        '' \
        '[Install]' \
        'WantedBy=default.target' >"${SYSTEMD_UNIT}"
    "${INSTALL_DIR}/mcp-composer.sh" start "${FORWARD_ARGS[@]}"
    systemctl --user daemon-reload
    systemctl --user enable --now mcp-composer.service
    printf 'Enabled the user systemd service. Enable user lingering separately for startup before login.\n'
elif ((NO_START == 0)); then
    "${INSTALL_DIR}/mcp-composer.sh" start "${FORWARD_ARGS[@]}"
fi
