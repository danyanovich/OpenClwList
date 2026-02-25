# OpenClwList &nbsp;·&nbsp; `v0.01`

> **Operational monitor UI for OpenClaw Gateway** — a soft, fast, bilingual (EN/RU) dashboard for managing agent fleets, tasks, schedules, and usage analytics.

---

## Overview

OpenClwList is a self-hosted web interface that connects to a running [OpenClaw Gateway](https://github.com/danyanovich/OpenClwList) instance via WebSocket and gives you a real-time operational window into your AI agent fleet.

```
OpenClaw Gateway  ──ws──►  OpenClwList Backend (Express + SQLite)
                                     │
                          ┌──────────┴──────────┐
                     Next.js UI             REST + SSE API
                  (5 pages, SSR-free)       /api/monitor/*
                                            /api/tasks
                                            /api/schedules
                                            /api/analytics
```

**Stack:** Node 24 · Express 5 · Next.js 16 · React 19 · Tailwind v4 · SQLite (`node:sqlite`) · TypeScript

---

## ⚡ Install via Assistant

Paste this into your **OpenClaw Agent** to install the dashboard's capabilities instantly:

> **Install OpenClwList for me! https://raw.githubusercontent.com/danyanovich/OpenClwList/main/public/skill.md**

---

## Features

| Module | Description |
|---|---|
| **Dashboard** | Live connection badge, task summary counters, active sessions |
| **Kanban Board** | Drag-and-drop task management with 5 columns: Planned → In Progress → Waiting Approval → Review → Done |
| **Agent Nexus** | Fleet view of all active agents and sub-agents with export (clipboard / file / ZIP) |
| **Cron Jobs** | Create and manage scheduled agent tasks with cron expressions |
| **Cost Intelligence** | Token usage and cost analytics by agent, with 7/30/90-day filters |

**UX highlights:**
- Light / dark theme — defaults to OS `prefers-color-scheme`, with a soft manual toggle
- EN / RU interface — language persists in `localStorage`
- Real-time updates via SSE with auto-reconnect
- Soft cream (light) and soft navy-purple (dark) palette — easy on the eyes

---

## Quickstart

```bash
# 1. Clone and install
git clone https://github.com/danyanovich/OpenClwList.git
cd OpenClwList
npm install

# 2. Configure
cp .env.example .env.local

# 3. Run in development
npm run dev
```

Open **`http://127.0.0.1:3010`**

---

## Instant Installation via OpenClaw Agent

The fastest way to connect this dashboard as a skill to your agent fleet:

1. Open the dashboard (default: `http://127.0.0.1:3010`).
2. Copy the installation command from the **"Install via OpenClaw Agent"** section.
3. Paste it into your OpenClaw agent chat.

The agent will automatically fetch the manifest from `/skill` and register the dashboard as a new capability.

The agent will automatically fetch the manifest from `/skill` and register the dashboard as a new capability.

---

## Remote Access

To access the dashboard from other devices (phone, tablet, another PC) on your local network:

1. **Configure Host**: Open `.env.local` and change `HOST=127.0.0.1` to `HOST=0.0.0.0`.
2. **Restart**: Restart the dashboard (`npm run dev`).
3. **Find IP**: Find your computer's local IP address (e.g., `192.168.1.5`).
4. **Connect**: Open `http://<your-ip>:3010` on your other device.

> [!CAUTION]
> Setting `HOST=0.0.0.0` makes the dashboard accessible to **anyone** on your local network.

---

## Environment Variables

> [!TIP]
> **Network Access vs Security:** By default, `HOST` is set to `127.0.0.1` so the dashboard is only accessible from your own machine (safe for public Wi-Fi). If you want to access the dashboard from other devices on your local network (e.g., your phone or iPad), change `HOST` to `0.0.0.0` in your `.env.local` file.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3010` | HTTP server port |
| `HOST` | `127.0.0.1` | Bind address (use `0.0.0.0` for network access) |
| `CLAWDBOT_URL` | `ws://127.0.0.1:18789` | OpenClaw Gateway WebSocket URL |
| `CLAWDBOT_API_TOKEN` | — | Explicit auth token (preferred) |
| `OPENCLAW_CONFIG_PATH` | — | Path to OpenClaw config file |
| `OPS_UI_DB_PATH` | `./data/ops-ui.sqlite` | SQLite database path |
| `OPS_UI_MAX_QUEUE` | `5000` | In-memory event queue cap |

**Token resolution order:**
1. `CLAWDBOT_API_TOKEN` env var
2. `OPENCLAW_CONFIG_PATH` → `gateway.auth.token`
3. `~/.openclaw/openclaw.json` → `gateway.auth.token`

---

## API Reference

### Monitor
```
GET  /api/monitor/sessions              Active agent sessions
GET  /api/monitor/runs                  All runs
GET  /api/monitor/runs/:runId/events    Events for a run
GET  /api/monitor/graph?window=3600     Activity graph
GET  /api/monitor/diagnostics           Health & diagnostics
GET  /api/monitor/events                SSE live event stream
POST /api/monitor/connect               Connect to gateway
POST /api/monitor/disconnect            Disconnect from gateway
POST /api/monitor/refresh-sessions      Force session refresh
POST /api/monitor/abort                 Abort active run
```

### Tasks
```
GET    /api/tasks                  List all tasks
POST   /api/tasks                  Create task
PUT    /api/tasks/:id              Update task title/description
DELETE /api/tasks/:id              Delete task
POST   /api/tasks/:id/status       Move task to new status (triggers dispatch)
POST   /api/tasks/:id/approval     Approve or reject a waiting-approval task
PUT    /api/tasks/:id/tags         Update task tags
```

### Schedules
```
GET    /api/schedules              List schedules
POST   /api/schedules              Create schedule
DELETE /api/schedules/:id          Delete schedule
```

### Analytics
```
GET  /api/analytics?days=30        Usage data (7 / 30 / 90 days)
```

---

## Production Deployment

```bash
npm run build
npm run start
```

Or with a process supervisor:

```bash
# tmux
tmux new-session -d -s openclaw 'npm run start'

# nohup
nohup npm run start > openclaw.log 2>&1 &

# pm2
pm2 start npm --name openclaw -- run start
```

**Health checks:**
```bash
curl http://127.0.0.1:3010/api/monitor/diagnostics
curl http://127.0.0.1:3010/api/tasks
```

---

## Development

```bash
npm run dev        # Start dev server with hot reload
npm run typecheck  # TypeScript check
npm run lint       # ESLint
npm run check      # typecheck + lint
npm run smoke      # Startup health check script
```

---

## Project Structure

```
OpenClwList/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Dashboard
│   ├── tasks/page.tsx      # Kanban Board
│   ├── agents/page.tsx     # Agent Nexus
│   ├── schedules/page.tsx  # Cron Jobs
│   ├── analytics/page.tsx  # Cost Intelligence
│   ├── components/         # ThemeToggle, LanguageToggle
│   └── i18n/               # Translations (EN/RU) + context
├── src/
│   ├── server.ts           # Express + Next.js server
│   ├── db.ts               # SQLite schema + queries
│   └── types.ts            # Shared TypeScript types
└── data/                   # SQLite database (gitignored)
```

---

## License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  <strong>OpenClwList</strong> &nbsp;·&nbsp; Built for the OpenClaw ecosystem
</p>
