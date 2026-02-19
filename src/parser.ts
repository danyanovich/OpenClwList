import type { MonitorEvent, MonitorExec, MonitorRun, MonitorSession, ParsedEnvelope } from './types.js'

const SCHEMA_VERSION = 1

const COMPAT_EVENT_MAP: Record<string, string> = {
  'exec.finished': 'exec.completed',
}

type ParentActionHistory = Map<string, number[]>

const parentActionHistory: ParentActionHistory = new Map()
const runSessionMap = new Map<string, string>()
const inferredParentMap = new Map<string, string>()
const MAX_ACTIONS_PER_PARENT = 10
const SPAWN_INFERENCE_WINDOW_MS = 10_000

function now(): number {
  return Date.now()
}

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseSessionKey(sessionKey: string): { agentId: string; channel: string } {
  const parts = sessionKey.split(':')
  return {
    agentId: parts[1] || 'main',
    channel: parts[2] || 'unknown',
  }
}

function isSubagent(sessionKey: string): boolean {
  return sessionKey.includes(':subagent:')
}

function trackParentAction(sessionKey: string, ts: number): void {
  if (isSubagent(sessionKey) || sessionKey === 'lifecycle') return
  const history = parentActionHistory.get(sessionKey) ?? []
  history.push(ts)
  if (history.length > MAX_ACTIONS_PER_PARENT) history.shift()
  parentActionHistory.set(sessionKey, history)
}

function inferSpawnedBy(subagentKey: string, ts: number): string | undefined {
  if (inferredParentMap.has(subagentKey)) return inferredParentMap.get(subagentKey)
  let bestParent: string | undefined
  let bestTs = 0
  for (const [parent, history] of parentActionHistory) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const t = history[i]!
      if (t <= ts && t >= ts - SPAWN_INFERENCE_WINDOW_MS && t > bestTs) {
        bestTs = t
        bestParent = parent
      }
      if (t <= ts) break
    }
  }
  if (bestParent) inferredParentMap.set(subagentKey, bestParent)
  return bestParent
}

function createEvent(params: {
  runId: string
  sessionKey: string
  kind: MonitorEvent['kind']
  stream?: string
  phase?: string
  state?: string
  seq?: number
  toolName?: string
  payload: unknown
  ts?: number
}): MonitorEvent {
  const timestamp = params.ts ?? now()
  const seqPart = params.seq == null ? 'na' : String(params.seq)
  const streamPart = params.stream ?? 'na'
  return {
    eventId: `${params.runId}:${streamPart}:${seqPart}:${timestamp}`,
    runId: params.runId,
    sessionKey: params.sessionKey,
    kind: params.kind,
    stream: params.stream,
    phase: params.phase,
    state: params.state,
    seq: params.seq,
    toolName: params.toolName,
    ts: timestamp,
    schemaVersion: SCHEMA_VERSION,
    payload: params.payload,
  }
}

function mapChatStateToRunState(state: string): MonitorRun['state'] {
  if (state === 'final') return 'final'
  if (state === 'error') return 'error'
  if (state === 'aborted') return 'aborted'
  return 'running'
}

export function parseGatewayEvent(frameEvent: string, payload: unknown, seq?: number): ParsedEnvelope | null {
  const event = COMPAT_EVENT_MAP[frameEvent] ?? frameEvent
  const timestamp = now()

  if (event === 'chat' && payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    const runId = trim(obj.runId)
    const sessionKey = trim(obj.sessionKey)
    const state = trim(obj.state) || 'delta'
    const eventSeq = typeof obj.seq === 'number' ? obj.seq : seq
    if (!runId || !sessionKey) return null

    runSessionMap.set(runId, sessionKey)
    trackParentAction(sessionKey, timestamp)

    const parsed = parseSessionKey(sessionKey)
    const session: Partial<MonitorSession> = {
      sessionKey,
      agentId: parsed.agentId,
      channel: parsed.channel,
      status: state === 'delta' ? 'thinking' : 'active',
      lastActivityAt: timestamp,
    }

    if (isSubagent(sessionKey)) {
      session.spawnedBy = inferSpawnedBy(sessionKey, timestamp)
    }

    const run: ParsedEnvelope['run'] = {
      runId,
      sessionKey,
      state: mapChatStateToRunState(state),
      startedAt: timestamp,
      endedAt: state === 'final' || state === 'error' || state === 'aborted' ? timestamp : undefined,
      error: state === 'error' ? trim((obj.errorMessage as string | undefined) ?? '') || undefined : undefined,
      lastSeq: eventSeq,
    }

    const parsedEvent = createEvent({
      runId,
      sessionKey,
      kind: 'chat',
      stream: 'chat',
      state,
      seq: eventSeq,
      payload,
      ts: timestamp,
    })

    return {
      session,
      run,
      event: parsedEvent,
      rawEvent: { event, payload, seq, ts: timestamp },
    }
  }

  if (event === 'agent' && payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    const runId = trim(obj.runId)
    const stream = trim(obj.stream) || 'agent'
    const eventSeq = typeof obj.seq === 'number' ? obj.seq : seq
    const data = (obj.data && typeof obj.data === 'object' ? obj.data : {}) as Record<string, unknown>
    const sessionKey = trim(obj.sessionKey) || runSessionMap.get(runId) || trim(obj.stream)
    if (!runId || !sessionKey) return null

    runSessionMap.set(runId, sessionKey)
    trackParentAction(sessionKey, timestamp)

    const parsed = parseSessionKey(sessionKey)
    const phase = trim(data.phase)
    const toolName = trim(data.name)

    const runState: MonitorRun['state'] = phase === 'error' ? 'error' : phase === 'end' ? 'final' : 'running'

    const run: ParsedEnvelope['run'] = {
      runId,
      sessionKey,
      state: runState,
      startedAt: timestamp,
      endedAt: phase === 'end' || phase === 'error' ? timestamp : undefined,
      error: phase === 'error' ? trim(data.error) || undefined : undefined,
      lastSeq: eventSeq,
    }

    const session: Partial<MonitorSession> = {
      sessionKey,
      agentId: parsed.agentId,
      channel: parsed.channel,
      status: runState === 'running' ? 'thinking' : 'active',
      lastActivityAt: timestamp,
      spawnedBy: isSubagent(sessionKey) ? inferSpawnedBy(sessionKey, timestamp) : undefined,
    }

    const parsedEvent = createEvent({
      runId,
      sessionKey,
      kind: 'agent',
      stream,
      phase,
      seq: eventSeq,
      toolName: toolName || undefined,
      payload,
      ts: timestamp,
    })

    return {
      session,
      run,
      event: parsedEvent,
      rawEvent: { event, payload, seq, ts: timestamp },
    }
  }

  if ((event === 'exec.started' || event === 'exec.output' || event === 'exec.completed') && payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    const runId = trim(obj.runId)
    const pid = typeof obj.pid === 'number' ? obj.pid : -1
    const sessionKey = trim(obj.sessionId) || trim(obj.sessionKey) || runSessionMap.get(runId) || 'unknown'
    const execId = `exec:${runId || 'none'}:${pid}`

    const command = trim(obj.command) || 'Exec'
    const output = trim(obj.output)
    const exitCode = typeof obj.exitCode === 'number' ? obj.exitCode : undefined
    const status = event === 'exec.started' ? 'running' : (exitCode != null && exitCode !== 0 ? 'failed' : 'completed')

    const exec: MonitorExec = {
      execId,
      runId: runId || undefined,
      sessionKey,
      command,
      status,
      exitCode,
      outputPreview: output.slice(0, 240) || undefined,
      updatedAt: timestamp,
    }

    const parsedEvent = createEvent({
      runId: runId || execId,
      sessionKey,
      kind: 'exec',
      stream: event,
      state: status,
      seq,
      payload,
      ts: timestamp,
    })

    return {
      event: parsedEvent,
      exec,
      session: sessionKey !== 'unknown' ? {
        sessionKey,
        ...parseSessionKey(sessionKey),
        status: 'thinking',
        lastActivityAt: timestamp,
      } : undefined,
      rawEvent: { event, payload, seq, ts: timestamp },
    }
  }

  return null
}

export function inferSessionFromListRow(row: Record<string, unknown>): MonitorSession | null {
  const sessionKey = trim(row.key)
  if (!sessionKey) return null

  const parsed = parseSessionKey(sessionKey)
  const spawnedBy = trim((row.spawnedBy as string | undefined) ?? '') || undefined
  const status = trim((row.abortedLastRun ? 'idle' : 'active')) as MonitorSession['status']
  const session: MonitorSession = {
    sessionKey,
    agentId: parsed.agentId,
    channel: trim(row.channel) || parsed.channel,
    status: status || 'idle',
    lastActivityAt: typeof row.updatedAt === 'number' ? row.updatedAt : now(),
    spawnedBy: spawnedBy || (isSubagent(sessionKey) ? inferSpawnedBy(sessionKey, now()) : undefined),
  }
  return session
}
