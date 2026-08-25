# MCP Composer releases

Release bundles run the published container image. Docker Engine with Docker Compose v2 is required. Docker Desktop provides both on Windows.

## Windows

1. Download and extract `mcp-composer-<version>-windows.zip`.
2. Start Docker Desktop.
3. Run `start.cmd`.

The launcher pulls the pinned image, waits for `/api/health`, and opens `http://127.0.0.1:8000`. Configuration is stored in `%LOCALAPPDATA%\MCP Composer\composer.env`.

```powershell
start.cmd -Port 8080 -NoBrowser
status.cmd
logs.cmd
stop.cmd
update.cmd
uninstall.cmd
```

`uninstall.cmd -PurgeConfig` also removes the launcher configuration. Container images remain in Docker's cache.

## Linux

Docker Engine 20.10 or newer, the Compose v2 plugin, and `curl` are required.

```bash
tar -xzf mcp-composer-<version>-linux.tar.gz
cd mcp-composer-<version>-linux
./install.sh
```

The unprivileged installer copies the runtime launcher to `${XDG_DATA_HOME:-$HOME/.local/share}/mcp-composer/runtime` and stores configuration in `${XDG_CONFIG_HOME:-$HOME/.config}/mcp-composer/composer.env`.

Useful commands:

```bash
./start.sh
./start.sh --port 8080 --open-browser
./status.sh
./logs.sh
./stop.sh
./update.sh
./uninstall.sh
./uninstall.sh --purge-config
```

To register a user service:

```bash
./install.sh --systemd
```

User services normally start after login. On a headless server, an administrator can enable user lingering separately if startup before login is required.

## Remote Linux access

The default release listens only on loopback. Open an SSH tunnel from the workstation that runs the browser:

```bash
ssh -L 8000:127.0.0.1:8000 USER@SERVER
```

Then open `http://127.0.0.1:8000`. Do not change the port binding to `0.0.0.0` without adding TLS and authentication.

An MCP HTTP server running on the Docker host can be addressed from the composer container as `host.docker.internal`. Stdio MCP commands run inside the container, not directly on the host, and are limited to commands installed in the image.

## Hosted profile

The `hosted` directory contains a separate Caddy-protected profile for a public domain. It requires DNS pointing to the server and inbound ports 80/443.

```bash
cd hosted
cp .env.hosted.example .env.hosted
docker run --rm -it caddy:2.11.4-alpine caddy hash-password
# Put the resulting hash and the domain in .env.hosted.
docker compose --env-file .env.hosted -f compose.hosted.yaml up --detach --wait
```

Keep the password hash in single quotes. Hosted mode blocks stdio servers, private MCP targets, and proxy tool calls. Populate `MCP_COMPOSER_REMOTE_HOSTS` with exact public HTTPS MCP hostnames.

This profile provides TLS and Basic Authentication. Add rate limiting and an outbound network policy at the host, firewall, or upstream gateway before treating it as an internet-facing service.

## Updates and rollback

Download the new bundle and run `update.cmd` or `./update.sh`. The launcher pins the image version from `VERSION`; it never follows `latest` silently.

Rollback to a published version:

```powershell
update.cmd -Version 0.1.0
```

```bash
./update.sh --version 0.1.0
```

Verify downloads with the `mcp-composer-<version>-checksums.txt` file attached to the GitHub Release.
