# Russian Key Coach backend deployment

This project now includes a dependency-free Python sync service that stores the
authoritative progress JSON on the server.

## Files

- `backend/russian_key_coach_sync.py`: HTTP sync service and seed command
- `deploy/systemd/russian-key-coach-sync.service`: systemd unit for port 8786
- `deploy/caddy/typing.macchiatolabs.ai.Caddyfile`: Caddy site block example

## API

- `GET /progress`: returns the canonical progress JSON
- `PUT /progress`: validates and stores a new canonical progress JSON
- `GET /health`: basic process and store health

The service is designed to run behind Caddy with `handle_path /api/*`, so the
backend sees `/progress` and `/health` directly on localhost.

## Install on the droplet

1. Copy the repo to `/opt/russian-key-coach`.
2. Install the systemd unit:

```sh
sudo cp /opt/russian-key-coach/deploy/systemd/russian-key-coach-sync.service /etc/systemd/system/russian-key-coach-sync.service
sudo systemctl daemon-reload
sudo systemctl enable --now russian-key-coach-sync.service
```

3. Seed the authoritative store from an exported JSON backup:

```sh
sudo /usr/bin/python3 /opt/russian-key-coach/backend/russian_key_coach_sync.py seed --data-dir /var/lib/russian-key-coach --source /path/to/russian-key-coach-export.json
```

4. Merge the example Caddy block into `/etc/caddy/Caddyfile`, then reload Caddy:

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## Storage behavior

- Canonical data file: `/var/lib/russian-key-coach/progress.json`
- Backup directory: `/var/lib/russian-key-coach/backups`
- Writes are atomic via temporary file plus rename
- Every successful overwrite keeps a timestamped backup of the previous store
