## Windows

1. Install and start Docker Desktop.
2. Download the `mcp-composer-*-windows.zip` file from **Assets** below.
3. Extract the entire archive.
4. Double-click `start.cmd`.

The browser opens automatically after the container becomes healthy. The default address is `http://127.0.0.1:8000`; if that port is occupied, the launcher selects a free port and prints the actual address.

## Linux

Docker Engine, Docker Compose v2, and `curl` are required.

```bash
tar -xzf mcp-composer-*-linux.tar.gz
cd mcp-composer-*-linux
./install.sh
```

The launcher prints the selected port and an SSH command. On a remote server, create that tunnel from your workstation, for example:

```bash
ssh -L 8000:127.0.0.1:8000 USER@SERVER
```

Then open `http://127.0.0.1:8000` locally. See `README.md` inside either archive for update, rollback, systemd, and uninstall instructions.
