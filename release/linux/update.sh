#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
"${SCRIPT_DIR}/install.sh" --no-start
USER_HOME_DIR=${HOME:?HOME is required}
RUNTIME=${XDG_DATA_HOME:-${USER_HOME_DIR}/.local/share}/mcp-composer/runtime/mcp-composer.sh
exec "${RUNTIME}" update "$@"
