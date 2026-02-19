# clawproject / ops-ui

Express-based monitoring UI for OpenClaw Gateway.

## What it does

- Connects to Gateway WebSocket stream (`CLAWDBOT_URL`)
- Stores sessions/runs/events/exec snapshots in SQLite (`node:sqlite`)
- Exposes REST + SSE APIs for monitor/timeline/diagnostics/tasks
- Serves a lightweight web UI from `public/`

## Quickstart

```bash
npm install
cp .env.example .env.local
# set CLAWDBOT_URL and token config (see below)
npm run dev
```

Open: `http://127.0.0.1:3010` (or your `HOST`/`PORT`).

## Environment variables

- `PORT` (default: `3010`)
- `HOST` (default: `0.0.0.0`)
- `CLAWDBOT_URL` (default: `ws://127.0.0.1:18789`)
- `CLAWDBOT_API_TOKEN` (optional, preferred explicit token)
- `OPENCLAW_CONFIG_PATH` (optional path to OpenClaw config with `gateway.auth.token`)
- `OPS_UI_DB_PATH` (optional SQLite path, default `./data/ops-ui.sqlite`)
- `OPS_UI_MAX_QUEUE` (optional in-memory event queue cap, default `5000`)

Token resolution order:
1. `CLAWDBOT_API_TOKEN`
2. `OPENCLAW_CONFIG_PATH` -> `gateway.auth.token`
3. `~/.openclaw/openclaw.json` -> `gateway.auth.token`

## API endpoints

### Monitor
- `GET /api/monitor/sessions`
- `GET /api/monitor/runs`
- `GET /api/monitor/runs/:runId/events`
- `GET /api/monitor/graph?window=3600`
- `GET /api/monitor/diagnostics`
- `GET /api/monitor/events` (SSE)
- `POST /api/monitor/connect`
- `POST /api/monitor/disconnect`
- `POST /api/monitor/refresh-sessions`
- `POST /api/monitor/abort`

### Tasks
- `GET /api/tasks`
- `POST /api/tasks/:id/status`

## Background mode notes

- Run detached with your preferred supervisor (`tmux`, `screen`, `pm2`, `systemd`, launchd).
- Example with `nohup`:

```bash
nohup npm run start > ops-ui.log 2>&1 &
```

- Health checks:
  - `curl http://127.0.0.1:3010/api/monitor/diagnostics`
  - `curl http://127.0.0.1:3010/api/tasks`

## Checks

```bash
npm run check
npm run smoke
```
