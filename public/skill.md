---
name: OpenClwList
description: Operational monitor for OpenClaw Gateway. Manage tasks, agents, and analytics.
version: 0.02
homepage: https://github.com/danyanovich/clawproject
---

# OpenClwList Skill

This skill allows the agent to interact with the OpenClwList dashboard to manage tasks, monitor sessions, and view analytics. It also contains instructions for automated local deployment.

## Capabilities

- **Task Management**: Create, update, and monitor status of tasks.
- **Agent Monitoring**: View active sessions and sub-agent runs.
- **Analytics**: Access token usage and cost data.
- **Auto-Deployment**: Instructions for cloning and running the dashboard.

## API Integration

The agent can interact with the following local endpoints (default `http://127.0.0.1:3010`):

- `GET /api/tasks`: List all tasks.
- `POST /api/tasks`: Create a new task.
- `GET /api/monitor/sessions`: List active agent sessions.
- `GET /api/analytics`: View usage analytics.

## Deployment Instructions

If the user asks to "install", "deploy", or "run" this dashboard, follow these steps:

1. **Clone**: `git clone https://github.com/danyanovich/clawproject.git`
2. **Setup**: `cd OpenClwList && npm install`
3. **Configure**: `cp .env.example .env.local`
4. **Run**: `npm run dev` (starts on port 3010 by default)

## Operational Guide

- When asked to "monitor tasks" or "check analytics", use the provided APIs.
- If the server is not reachable, advise the user to run it first using the Deployment Instructions above.
- Confirm setup status by checking `GET /api/monitor/diagnostics`.
