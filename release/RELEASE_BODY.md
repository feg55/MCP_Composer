## Windows

1. Install and start Docker Desktop.
2. Download the `mcp-composer-*-windows.zip` file from **Assets** below.
3. Extract the entire archive.
4. Double-click `start.cmd`.

The browser opens automatically at `http://127.0.0.1:8000` after the container becomes healthy.

## Linux

Docker Engine, Docker Compose v2, and `curl` are required.

```bash
tar -xzf mcp-composer-*-linux.tar.gz
cd mcp-composer-*-linux
./install.sh
```

On a remote server, create an SSH tunnel from your workstation:

```bash
ssh -L 8000:127.0.0.1:8000 USER@SERVER
```

Then open `http://127.0.0.1:8000` locally. See `README.md` inside either archive for update, rollback, systemd, and uninstall instructions.
