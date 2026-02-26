# OpenClwList Remote Deployment (systemd + Caddy)

This project now supports `local` and `remote` modes via environment variables.

## Recommended topology

- Run `OpenClaw` and this dashboard on the same host (dashboard binds to `127.0.0.1`)
- Put `Caddy` in front for TLS and public access
- Enable app-level bearer auth for `/api/*`

## `.env` example (remote mode)

```bash
OPS_UI_MODE=remote
OPS_UI_HOST=127.0.0.1
OPS_UI_PORT=3010
OPS_UI_TRUST_PROXY=true

OPS_UI_AUTH_ENABLED=true
OPS_UI_BEARER_TOKEN=replace_with_a_long_random_token
OPS_UI_REMOTE_ALLOW_DANGEROUS_ACTIONS=false

CLAWDBOT_URL=ws://127.0.0.1:18789
# CLAWDBOT_API_TOKEN=...
```

## systemd unit example

`/etc/systemd/system/openclwlist.service`

```ini
[Unit]
Description=OpenClwList ops-agent dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/OpenClwList
EnvironmentFile=/opt/OpenClwList/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=2
User=openclaw
Group=openclaw

[Install]
WantedBy=multi-user.target
```

## Caddy example

```caddyfile
dashboard.example.com {
  encode zstd gzip

  reverse_proxy 127.0.0.1:3010
}
```

Notes:
- WebSocket/SSE are handled automatically by `reverse_proxy`.
- Keep `OPS_UI_HOST=127.0.0.1` so the app is only reachable through Caddy.
- `OPS_UI_REMOTE_ALLOW_DANGEROUS_ACTIONS=false` keeps destructive endpoints blocked by default.
