# TECH_SPEC: ops-ui (Express + SSE + SQLite)

## 1. Purpose

`ops-ui` is an operational dashboard for OpenClaw Gateway traffic.
It ingests gateway events, normalizes them, persists a read model, and serves APIs/UI for observability and lightweight task tracking.

## 2. Stack

- Runtime: Node.js (uses `node:sqlite`)
- Server: Express 5
- Transport: WebSocket client (`ws`) to Gateway, SSE to browser
- Storage: SQLite (`DatabaseSync`)
- Frontend: static HTML/CSS/JS from `public/`

## 3. High-level architecture

1. `GatewayClient` connects to Gateway and subscribes to event flow.
2. Raw gateway envelopes are queued and parsed (`parser.ts`).
3. Parsed entities are persisted to SQLite (`db.ts`).
4. Server emits incremental updates via `/api/monitor/events` (SSE).
5. UI polls/streams monitor + tasks + diagnostics endpoints.

## 4. Data model (SQLite)

Tables:
- `sessions`
- `runs`
- `events`
- `execs`
- `tasks`

Main properties:
- idempotent upserts for sessions/runs/execs
- event payload JSON persistence with `schema_version`
- auto-generated tasks linked by `source_run_id`

## 5. API surface

### Monitor APIs
- `GET /api/monitor/sessions`
- `GET /api/monitor/runs`
- `GET /api/monitor/runs/:runId/events`
- `GET /api/monitor/graph`
- `GET /api/monitor/diagnostics`
- `GET /api/monitor/events` (SSE)
- `POST /api/monitor/connect`
- `POST /api/monitor/disconnect`
- `POST /api/monitor/refresh-sessions`
- `POST /api/monitor/abort`

### Task APIs
- `GET /api/tasks`
- `POST /api/tasks/:id/status`

## 6. Runtime behavior

- Server starts even if Gateway is unreachable; reconnect logic is internal.
- Queue backpressure can drop noisy delta events when queue is full.
- Diagnostics expose parser errors, reconnect attempts, stream gaps, and drop counters.
- Session refresh runs periodically while connected.

## 7. Configuration

Required at minimum:
- `CLAWDBOT_URL`

Auth options:
- `CLAWDBOT_API_TOKEN`, or
- `OPENCLAW_CONFIG_PATH` pointing to OpenClaw config with `gateway.auth.token`

Optional:
- `PORT`, `HOST`, `OPS_UI_DB_PATH`, `OPS_UI_MAX_QUEUE`

## 8. Non-goals

- No Next.js/React app-router UI in current version.
- No heavy client framework; static UI is intentional for low operational overhead.
