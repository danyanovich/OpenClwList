import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { MonitorEvent, MonitorExec, MonitorRun, MonitorSession, TaskItem, TaskStatus } from './types.js'

const DB_PATH = process.env.OPS_UI_DB_PATH || path.resolve(process.cwd(), 'data', 'ops-ui.sqlite')

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

export const db = new DatabaseSync(DB_PATH)

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS sessions (
  session_key TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  last_activity_at INTEGER NOT NULL,
  spawned_by TEXT
);

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  state TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  error TEXT,
  last_seq INTEGER
);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  session_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  stream TEXT,
  phase TEXT,
  tool_name TEXT,
  state TEXT,
  seq INTEGER,
  ts INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS execs (
  exec_id TEXT PRIMARY KEY,
  run_id TEXT,
  session_key TEXT,
  command TEXT NOT NULL,
  status TEXT NOT NULL,
  exit_code INTEGER,
  output_preview TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  source_run_id TEXT UNIQUE,
  session_key TEXT,
  auto_generated INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  topic TEXT
);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  cron_expr TEXT NOT NULL,
  session_key TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_run_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_session ON runs(session_key, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id, ts ASC);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);

UPDATE tasks SET status='planned' WHERE status='todo';
`)

try {
  db.exec(`ALTER TABLE tasks ADD COLUMN tags TEXT DEFAULT '[]';`)
} catch {
  // Column may already exist
}

try {
  db.exec(`ALTER TABLE tasks ADD COLUMN topic TEXT;`)
} catch {
  // Column may already exist
}

const upsertSessionStmt = db.prepare(`
INSERT INTO sessions (session_key, agent_id, channel, status, last_activity_at, spawned_by)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(session_key) DO UPDATE SET
  agent_id=excluded.agent_id,
  channel=excluded.channel,
  status=excluded.status,
  last_activity_at=excluded.last_activity_at,
  spawned_by=COALESCE(sessions.spawned_by, excluded.spawned_by)
`)

const upsertRunStmt = db.prepare(`
INSERT INTO runs (run_id, session_key, state, started_at, ended_at, error, last_seq)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(run_id) DO UPDATE SET
  session_key=COALESCE(excluded.session_key, runs.session_key),
  state=excluded.state,
  ended_at=COALESCE(excluded.ended_at, runs.ended_at),
  error=COALESCE(excluded.error, runs.error),
  last_seq=COALESCE(excluded.last_seq, runs.last_seq)
`)

const insertEventStmt = db.prepare(`
INSERT OR REPLACE INTO events (event_id, run_id, session_key, kind, stream, phase, tool_name, state, seq, ts, schema_version, payload_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const upsertExecStmt = db.prepare(`
INSERT INTO execs (exec_id, run_id, session_key, command, status, exit_code, output_preview, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(exec_id) DO UPDATE SET
  run_id=COALESCE(excluded.run_id, execs.run_id),
  session_key=COALESCE(excluded.session_key, execs.session_key),
  command=COALESCE(NULLIF(excluded.command, ''), execs.command),
  status=excluded.status,
  exit_code=COALESCE(excluded.exit_code, execs.exit_code),
  output_preview=COALESCE(excluded.output_preview, execs.output_preview),
  updated_at=excluded.updated_at
`)

const insertTaskStmt = db.prepare(`
INSERT INTO tasks (id, title, description, status, source_run_id, session_key, auto_generated, created_at, updated_at, tags, topic)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateTaskStatusStmt = db.prepare(`
UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?
`)

const updateAutoTaskMetaStmt = db.prepare(`
UPDATE tasks
SET title = ?, description = ?, session_key = COALESCE(?, session_key), updated_at = ?
WHERE id = ? AND auto_generated = 1
`)

const updateTaskStatusByRunStmt = db.prepare(`
UPDATE tasks
SET status = ?, updated_at = ?
WHERE source_run_id = ? AND auto_generated = 1 AND status <> ?
`)

export function upsertSession(session: MonitorSession): void {
  upsertSessionStmt.run(
    session.sessionKey,
    session.agentId,
    session.channel,
    session.status,
    session.lastActivityAt,
    session.spawnedBy ?? null,
  )
}

export function upsertRun(run: MonitorRun): void {
  upsertRunStmt.run(
    run.runId,
    run.sessionKey,
    run.state,
    run.startedAt,
    run.endedAt ?? null,
    run.error ?? null,
    run.lastSeq ?? null,
  )
}

export function insertEvent(event: MonitorEvent): void {
  insertEventStmt.run(
    event.eventId,
    event.runId,
    event.sessionKey,
    event.kind,
    event.stream ?? null,
    event.phase ?? null,
    event.toolName ?? null,
    event.state ?? null,
    event.seq ?? null,
    event.ts,
    event.schemaVersion,
    JSON.stringify(event.payload),
  )
}

export function upsertExec(exec: MonitorExec): void {
  upsertExecStmt.run(
    exec.execId,
    exec.runId ?? null,
    exec.sessionKey ?? null,
    exec.command,
    exec.status,
    exec.exitCode ?? null,
    exec.outputPreview ?? null,
    exec.updatedAt,
  )
}

export function getSessions(filters: {
  agentId?: string
  channel?: string
  status?: string
  from?: number
  to?: number
}): MonitorSession[] {
  const clauses: string[] = []
  const args: Array<string | number> = []
  if (filters.agentId) {
    clauses.push('agent_id = ?')
    args.push(filters.agentId)
  }
  if (filters.channel) {
    clauses.push('channel = ?')
    args.push(filters.channel)
  }
  if (filters.status) {
    clauses.push('status = ?')
    args.push(filters.status)
  }
  if (filters.from) {
    clauses.push('last_activity_at >= ?')
    args.push(filters.from)
  }
  if (filters.to) {
    clauses.push('last_activity_at <= ?')
    args.push(filters.to)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `SELECT session_key, agent_id, channel, status, last_activity_at, spawned_by FROM sessions ${where} ORDER BY last_activity_at DESC LIMIT 1000`,
    )
    .all(...args) as Array<Record<string, unknown>>

  return rows.map((row) => ({
    sessionKey: String(row.session_key),
    agentId: String(row.agent_id),
    channel: String(row.channel),
    status: (String(row.status) as MonitorSession['status']) || 'idle',
    lastActivityAt: Number(row.last_activity_at),
    spawnedBy: row.spawned_by == null ? undefined : String(row.spawned_by),
  }))
}

export function getDistinctAgents(): Array<{
  agentId: string
  lastActivityAt: number
  sessionCount: number
}> {
  const rows = db
    .prepare(
      `SELECT agent_id, MAX(last_activity_at) as last_activity_at, COUNT(*) as session_count
       FROM sessions
       WHERE spawned_by IS NULL
       GROUP BY agent_id
       ORDER BY last_activity_at DESC`,
    )
    .all() as Array<Record<string, unknown>>

  return rows.map((r) => ({
    agentId: String(r.agent_id),
    lastActivityAt: Number(r.last_activity_at),
    sessionCount: Number(r.session_count),
  }))
}

export function getRuns(filters: {
  sessionKey?: string
  agentId?: string
  from?: number
  to?: number
}): MonitorRun[] {
  const clauses: string[] = []
  const args: Array<string | number> = []
  if (filters.sessionKey) {
    clauses.push('r.session_key = ?')
    args.push(filters.sessionKey)
  }
  if (filters.agentId) {
    clauses.push('s.agent_id = ?')
    args.push(filters.agentId)
  }
  if (filters.from) {
    clauses.push('r.started_at >= ?')
    args.push(filters.from)
  }
  if (filters.to) {
    clauses.push('r.started_at <= ?')
    args.push(filters.to)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = db
    .prepare(
      `SELECT r.run_id, r.session_key, r.state, r.started_at, r.ended_at, r.error, r.last_seq
       FROM runs r
       LEFT JOIN sessions s ON s.session_key = r.session_key
       ${where}
       ORDER BY r.started_at DESC
       LIMIT 2000`,
    )
    .all(...args) as Array<Record<string, unknown>>

  return rows.map((row) => ({
    runId: String(row.run_id),
    sessionKey: String(row.session_key),
    state: String(row.state) as MonitorRun['state'],
    startedAt: Number(row.started_at),
    endedAt: row.ended_at == null ? undefined : Number(row.ended_at),
    error: row.error == null ? undefined : String(row.error),
    lastSeq: row.last_seq == null ? undefined : Number(row.last_seq),
  }))
}

export function getRunEvents(runId: string): MonitorEvent[] {
  const rows = db
    .prepare(
      `SELECT event_id, run_id, session_key, kind, stream, phase, tool_name, state, seq, ts, schema_version, payload_json
       FROM events WHERE run_id = ? ORDER BY ts ASC LIMIT 5000`,
    )
    .all(runId) as Array<Record<string, unknown>>

  return rows.map((row) => ({
    eventId: String(row.event_id),
    runId: String(row.run_id),
    sessionKey: String(row.session_key),
    kind: String(row.kind) as MonitorEvent['kind'],
    stream: row.stream == null ? undefined : String(row.stream),
    phase: row.phase == null ? undefined : String(row.phase),
    toolName: row.tool_name == null ? undefined : String(row.tool_name),
    state: row.state == null ? undefined : String(row.state),
    seq: row.seq == null ? undefined : Number(row.seq),
    ts: Number(row.ts),
    schemaVersion: Number(row.schema_version),
    payload: JSON.parse(String(row.payload_json)),
  }))
}

export function getGraph(windowMs: number): {
  sessions: MonitorSession[]
  runs: MonitorRun[]
  edges: Array<{ source: string; target: string; type: 'session-run' | 'spawn' }>
} {
  const now = Date.now()
  const since = now - windowMs
  const sessions = getSessions({ from: since })
  const runs = getRuns({ from: since })
  const edges: Array<{ source: string; target: string; type: 'session-run' | 'spawn' }> = []

  for (const run of runs) {
    edges.push({ source: run.sessionKey, target: run.runId, type: 'session-run' })
  }
  for (const session of sessions) {
    if (session.spawnedBy) {
      edges.push({ source: session.spawnedBy, target: session.sessionKey, type: 'spawn' })
    }
  }

  return { sessions, runs, edges }
}

export function getRecentEvents(limit: number): MonitorEvent[] {
  const rows = db
    .prepare(
      `SELECT event_id, run_id, session_key, kind, stream, phase, tool_name, state, seq, ts, schema_version, payload_json
       FROM events ORDER BY ts DESC LIMIT ?`,
    )
    .all(limit) as Array<Record<string, unknown>>

  return rows.map((row) => ({
    eventId: String(row.event_id),
    runId: String(row.run_id),
    sessionKey: String(row.session_key),
    kind: String(row.kind) as MonitorEvent['kind'],
    stream: row.stream == null ? undefined : String(row.stream),
    phase: row.phase == null ? undefined : String(row.phase),
    toolName: row.tool_name == null ? undefined : String(row.tool_name),
    state: row.state == null ? undefined : String(row.state),
    seq: row.seq == null ? undefined : Number(row.seq),
    ts: Number(row.ts),
    schemaVersion: Number(row.schema_version),
    payload: JSON.parse(String(row.payload_json)),
  }))
}

function rowToTask(row: Record<string, unknown>): TaskItem {
  let tags: string[] = []
  try {
    if (row.tags) tags = JSON.parse(String(row.tags))
  } catch { }

  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description == null ? undefined : String(row.description),
    status: String(row.status) as TaskStatus,
    sourceRunId: row.source_run_id == null ? undefined : String(row.source_run_id),
    sessionKey: row.session_key == null ? undefined : String(row.session_key),
    autoGenerated: Number(row.auto_generated) === 1,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    tags,
    topic: row.topic == null ? undefined : String(row.topic),
  }
}

export function listTasks(limit = 500): TaskItem[] {
  const rows = db
    .prepare(
      `SELECT id, title, description, status, source_run_id, session_key, auto_generated, created_at, updated_at, tags, topic
       FROM tasks ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as Array<Record<string, unknown>>
  return rows.map(rowToTask)
}

export function getTask(id: string): TaskItem | undefined {
  const row = db
    .prepare(
      `SELECT id, title, description, status, source_run_id, session_key, auto_generated, created_at, updated_at, tags, topic
       FROM tasks WHERE id = ? LIMIT 1`,
    )
    .get(id) as Record<string, unknown> | undefined
  return row ? rowToTask(row) : undefined
}

export function createTask(params: {
  id: string
  title: string
  description?: string
  status?: TaskStatus
  sourceRunId?: string
  sessionKey?: string
  autoGenerated?: boolean
  createdAt?: number
  tags?: string[]
  topic?: string
}): void {
  const ts = params.createdAt ?? Date.now()
  insertTaskStmt.run(
    params.id,
    params.title,
    params.description ?? null,
    params.status ?? 'todo',
    params.sourceRunId ?? null,
    params.sessionKey ?? null,
    params.autoGenerated === false ? 0 : 1,
    ts,
    ts,
    JSON.stringify(params.tags || []),
    params.topic ?? null,
  )
}

export function ensureTaskForRun(params: {
  runId: string
  sessionKey?: string
  title: string
  description?: string
}): { created: boolean; taskId: string } {
  const existing = db
    .prepare(
      `SELECT id FROM tasks WHERE source_run_id = ? LIMIT 1`,
    )
    .get(params.runId) as Record<string, unknown> | undefined
  if (existing?.id) {
    return { created: false, taskId: String(existing.id) }
  }
  const taskId = `task:${params.runId}`
  createTask({
    id: taskId,
    title: params.title,
    description: params.description,
    sourceRunId: params.runId,
    sessionKey: params.sessionKey,
    autoGenerated: true,
  })
  return { created: true, taskId }
}

export function upsertAutoTaskForRun(params: {
  runId: string
  sessionKey?: string
  title: string
  description?: string
  isUserPrompt?: boolean
}): { created: boolean; updated: boolean; taskId: string } {
  const existing = db
    .prepare(
      `SELECT id, title, description, auto_generated FROM tasks WHERE source_run_id = ? LIMIT 1`,
    )
    .get(params.runId) as Record<string, unknown> | undefined

  if (!existing?.id) {
    const created = ensureTaskForRun(params)
    return { created: created.created, updated: false, taskId: created.taskId }
  }

  const taskId = String(existing.id)
  const existingTitle = existing.title == null ? '' : String(existing.title)
  const existingDescription = existing.description == null ? '' : String(existing.description)
  const isAutoGenerated = Number(existing.auto_generated) === 1

  const newTitle = params.title.trim()
  const oldTitle = existingTitle.trim()
  const isPlaceholderTitle = oldTitle.startsWith('OpenClaw message in ') || oldTitle.startsWith('OpenClaw run ')
  const score = (value: string, isPrompt: boolean): number => {
    if (!value) return 0
    let s = 0
    if (value.length <= 2) s = 1
    else if (value.length <= 8) s = 2
    else if (value.length <= 20) s = 3
    else s = 4
    if (isPrompt) s += 10
    return s
  }

  const hasBetterTitle =
    newTitle.length > 0 &&
    newTitle !== oldTitle &&
    (isPlaceholderTitle || score(newTitle, !!params.isUserPrompt) > score(oldTitle, false))
  const hasBetterDescription = (params.description ?? '').trim().length > 0 && (params.description ?? '') !== existingDescription

  if (isAutoGenerated && (hasBetterTitle || hasBetterDescription || params.sessionKey)) {
    updateAutoTaskMetaStmt.run(
      hasBetterTitle ? newTitle : oldTitle,
      hasBetterDescription ? params.description ?? null : (existingDescription || null),
      params.sessionKey ?? null,
      Date.now(),
      taskId,
    )
    return { created: false, updated: true, taskId }
  }

  return { created: false, updated: false, taskId }
}
export function updateTaskStatus(params: { id: string; status: TaskStatus }): boolean {
  const result = updateTaskStatusStmt.run(params.status, Date.now(), params.id)
  return Number(result.changes ?? 0) > 0
}

const updateTaskSessionKeyStmt = db.prepare(`
UPDATE tasks SET session_key = ?, updated_at = ? WHERE id = ?
`)

export function updateTaskSessionKey(params: { id: string; sessionKey: string }): boolean {
  const result = updateTaskSessionKeyStmt.run(params.sessionKey, Date.now(), params.id)
  return Number(result.changes ?? 0) > 0
}

const updateTaskSourceRunIdStmt = db.prepare(`
UPDATE tasks SET source_run_id = ?, updated_at = ? WHERE id = ?
`)

export function updateTaskSourceRunId(params: { id: string; runId: string }): boolean {
  const result = updateTaskSourceRunIdStmt.run(params.runId, Date.now(), params.id)
  return Number(result.changes ?? 0) > 0
}

export function updateAutoTaskStatusByRun(params: { runId: string; status: TaskStatus }): boolean {
  const result = updateTaskStatusByRunStmt.run(params.status, Date.now(), params.runId, params.status)
  return Number(result.changes ?? 0) > 0
}

const updateTaskTagsStmt = db.prepare(`
UPDATE tasks SET tags = ?, updated_at = ? WHERE id = ?
`)

export function updateTaskTags(id: string, tags: string[]): boolean {
  const result = updateTaskTagsStmt.run(JSON.stringify(tags), Date.now(), id)
  return Number(result.changes ?? 0) > 0
}

// --- Task CRUD helpers ---

const deleteTaskStmt = db.prepare(`DELETE FROM tasks WHERE id = ?`)

export function deleteTask(id: string): boolean {
  const result = deleteTaskStmt.run(id)
  return Number(result.changes ?? 0) > 0
}

const updateTaskFieldsStmt = db.prepare(`
UPDATE tasks SET title = ?, description = ?, topic = ?, updated_at = ? WHERE id = ?
`)

export function updateTaskFields(params: { id: string; title: string; description?: string; topic?: string }): boolean {
  const result = updateTaskFieldsStmt.run(
    params.title,
    params.description ?? null,
    params.topic ?? null,
    Date.now(),
    params.id,
  )
  return Number(result.changes ?? 0) > 0
}

export type ScheduleItem = {
  id: string
  cronExpr: string
  sessionKey: string
  prompt: string
  createdAt: number
  lastRunAt: number | null
}

const insertScheduleStmt = db.prepare(`
INSERT INTO schedules (id, cron_expr, session_key, prompt, created_at)
VALUES (?, ?, ?, ?, ?)
`)

const deleteScheduleStmt = db.prepare(`DELETE FROM schedules WHERE id = ?`)

const updateScheduleLastRunStmt = db.prepare(`
UPDATE schedules SET last_run_at = ? WHERE id = ?
`)

export function listSchedules(): ScheduleItem[] {
  const rows = db.prepare(`SELECT id, cron_expr, session_key, prompt, created_at, last_run_at FROM schedules ORDER BY created_at DESC`).all() as Array<Record<string, unknown>>
  return rows.map(r => ({
    id: String(r.id),
    cronExpr: String(r.cron_expr),
    sessionKey: String(r.session_key),
    prompt: String(r.prompt),
    createdAt: Number(r.created_at),
    lastRunAt: r.last_run_at != null ? Number(r.last_run_at) : null
  }))
}

export function createSchedule(params: {
  id: string
  cronExpr: string
  sessionKey: string
  prompt: string
}): void {
  insertScheduleStmt.run(
    params.id,
    params.cronExpr,
    params.sessionKey,
    params.prompt,
    Date.now()
  )
}

export function deleteSchedule(id: string): boolean {
  const result = deleteScheduleStmt.run(id)
  return Number(result.changes ?? 0) > 0
}

export function updateScheduleLastRun(id: string, ts: number): boolean {
  const result = updateScheduleLastRunStmt.run(ts, id)
  return Number(result.changes ?? 0) > 0
}

export type AgentAnalytics = {
  agentId: string
  date: string
  promptTokens: number
  completionTokens: number
  totalCost: number
}

export function getAnalytics(days = 30): AgentAnalytics[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const rows = db.prepare(`
    SELECT
      s.agent_id as agentId,
      date(e.ts / 1000, 'unixepoch', 'localtime') as date,
      SUM(CAST(COALESCE(json_extract(e.payload_json, '$.usage.promptTokens'), json_extract(e.payload_json, '$.usage.prompt_tokens'), 0) AS INTEGER)) as promptTokens,
      SUM(CAST(COALESCE(json_extract(e.payload_json, '$.usage.completionTokens'), json_extract(e.payload_json, '$.usage.completion_tokens'), 0) AS INTEGER)) as completionTokens,
      SUM(CAST(COALESCE(json_extract(e.payload_json, '$.usage.totalCost'), json_extract(e.payload_json, '$.totalCost'), json_extract(e.payload_json, '$.usage.total_cost'), 0) AS REAL)) as totalCost
    FROM events e
    JOIN sessions s ON e.session_key = s.session_key
    WHERE e.ts >= ?
    GROUP BY s.agent_id, date
    HAVING promptTokens > 0 OR completionTokens > 0 OR totalCost > 0
    ORDER BY date DESC, s.agent_id ASC
  `).all(cutoff) as Array<Record<string, unknown>>

  return rows.map(r => ({
    agentId: String(r.agentId),
    date: String(r.date),
    promptTokens: Number(r.promptTokens || 0),
    completionTokens: Number(r.completionTokens || 0),
    totalCost: Number(r.totalCost || 0)
  }))
}
