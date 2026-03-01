// Browser port of src/parser.ts — pure JS, no Node.js deps

export type MonitorSession = {
  sessionKey: string
  agentId: string
  channel: string
  status: 'idle' | 'active' | 'thinking'
  lastActivityAt: number
  spawnedBy?: string
}

export type MonitorRun = {
  runId: string
  sessionKey: string
  state: 'running' | 'final' | 'error' | 'aborted'
  startedAt: number
  endedAt?: number
  error?: string
  lastSeq?: number
}

export type MonitorEvent = {
  eventId: string
  runId: string
  sessionKey: string
  kind: 'chat' | 'agent' | 'exec' | 'system'
  stream?: string
  phase?: string
  toolName?: string
  state?: string
  seq?: number
  ts: number
  payload: unknown
}

export type MonitorExec = {
  execId: string
  runId?: string
  sessionKey?: string
  command: string
  status: 'running' | 'completed' | 'failed'
  exitCode?: number
  outputPreview?: string
  updatedAt: number
}

export type ParsedEnvelope = {
  session?: Partial<MonitorSession>
  run?: Partial<MonitorRun> & { runId: string; sessionKey?: string }
  event?: MonitorEvent
  exec?: MonitorExec
  rawEvent?: { event: string; payload?: unknown; seq?: number; ts: number }
}

const COMPAT_EVENT_MAP: Record<string, string> = {
  'exec.finished': 'exec.completed',
}

const parentActionHistory = new Map<string, number[]>()
const runSessionMap = new Map<string, string>()
const inferredParentMap = new Map<string, string>()
const MAX_ACTIONS_PER_PARENT = 10
const SPAWN_INFERENCE_WINDOW_MS = 10_000

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseSessionKey(sessionKey: string): { agentId: string; channel: string } {
  const parts = sessionKey.split(':')
  return { agentId: parts[1] || 'main', channel: parts[2] || 'unknown' }
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
    for (let i = history.length - 1; i >= 0; i--) {
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

function makeEventId(runId: string, stream: string | undefined, seq: number | undefined, ts: number): string {
  return `${runId}:${stream ?? 'na'}:${seq ?? 'na'}:${ts}`
}

function mapChatStateToRunState(state: string): MonitorRun['state'] {
  if (state === 'final') return 'final'
  if (state === 'error') return 'error'
  if (state === 'aborted') return 'aborted'
  return 'running'
}

export function parseGatewayEvent(
  frameEvent: string,
  payload: unknown,
  seq?: number,
): ParsedEnvelope | null {
  const event = COMPAT_EVENT_MAP[frameEvent] ?? frameEvent
  const timestamp = Date.now()

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

    return {
      session,
      run: {
        runId,
        sessionKey,
        state: mapChatStateToRunState(state),
        startedAt: timestamp,
        endedAt:
          state === 'final' || state === 'error' || state === 'aborted' ? timestamp : undefined,
        error:
          state === 'error'
            ? trim((obj.errorMessage as string | undefined) ?? '') || undefined
            : undefined,
        lastSeq: eventSeq,
      },
      event: {
        eventId: makeEventId(runId, 'chat', eventSeq, timestamp),
        runId,
        sessionKey,
        kind: 'chat',
        stream: 'chat',
        state,
        seq: eventSeq,
        ts: timestamp,
        payload,
      },
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
    const runState: MonitorRun['state'] =
      phase === 'error' ? 'error' : phase === 'end' ? 'final' : 'running'

    return {
      session: {
        sessionKey,
        agentId: parsed.agentId,
        channel: parsed.channel,
        status: runState === 'running' ? 'thinking' : 'active',
        lastActivityAt: timestamp,
        spawnedBy: isSubagent(sessionKey) ? inferSpawnedBy(sessionKey, timestamp) : undefined,
      },
      run: {
        runId,
        sessionKey,
        state: runState,
        startedAt: timestamp,
        endedAt: phase === 'end' || phase === 'error' ? timestamp : undefined,
        error: phase === 'error' ? trim(data.error) || undefined : undefined,
        lastSeq: eventSeq,
      },
      event: {
        eventId: makeEventId(runId, stream, eventSeq, timestamp),
        runId,
        sessionKey,
        kind: 'agent',
        stream,
        phase,
        toolName: toolName || undefined,
        seq: eventSeq,
        ts: timestamp,
        payload,
      },
      rawEvent: { event, payload, seq, ts: timestamp },
    }
  }

  if (
    (event === 'exec.started' || event === 'exec.output' || event === 'exec.completed') &&
    payload &&
    typeof payload === 'object'
  ) {
    const obj = payload as Record<string, unknown>
    const runId = trim(obj.runId)
    const pid = typeof obj.pid === 'number' ? obj.pid : -1
    const sessionKey =
      trim(obj.sessionId) || trim(obj.sessionKey) || runSessionMap.get(runId) || 'unknown'
    const execId = `exec:${runId || 'none'}:${pid}`
    const command = trim(obj.command) || 'Exec'
    const output = trim(obj.output)
    const exitCode = typeof obj.exitCode === 'number' ? obj.exitCode : undefined
    const status =
      event === 'exec.started'
        ? 'running'
        : exitCode != null && exitCode !== 0
          ? 'failed'
          : 'completed'

    return {
      event: {
        eventId: makeEventId(runId || execId, event, seq, timestamp),
        runId: runId || execId,
        sessionKey,
        kind: 'exec',
        stream: event,
        state: status,
        seq,
        ts: timestamp,
        payload,
      },
      exec: {
        execId,
        runId: runId || undefined,
        sessionKey,
        command,
        status,
        exitCode,
        outputPreview: output.slice(0, 240) || undefined,
        updatedAt: timestamp,
      },
      session:
        sessionKey !== 'unknown'
          ? {
              sessionKey,
              ...parseSessionKey(sessionKey),
              status: 'thinking',
              lastActivityAt: timestamp,
            }
          : undefined,
      rawEvent: { event, payload, seq, ts: timestamp },
    }
  }

  return null
}

// --- Analytics helpers ---
export type TokenUsageEntry = {
  agentId: string
  date: string  // YYYY-MM-DD
  promptTokens: number
  completionTokens: number
  totalCost: number
}

const MODEL_COST_PER_TOKEN: Record<string, { prompt: number; completion: number }> = {
  default: { prompt: 0.000003, completion: 0.000015 },
}

function estimateCost(model: string, prompt: number, completion: number): number {
  const rates = MODEL_COST_PER_TOKEN[model] ?? MODEL_COST_PER_TOKEN.default!
  return prompt * rates.prompt + completion * rates.completion
}

export function extractTokenUsage(
  sessionKey: string,
  payload: unknown,
): TokenUsageEntry | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  if (obj.state !== 'final') return null
  const usage = obj.usage as Record<string, unknown> | undefined
  if (!usage) return null
  const promptTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0
  const completionTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0
  if (!promptTokens && !completionTokens) return null

  const parsed = parseSessionKey(sessionKey)
  const model = typeof obj.model === 'string' ? obj.model : 'default'
  const date = new Date().toISOString().slice(0, 10)

  return {
    agentId: parsed.agentId,
    date,
    promptTokens,
    completionTokens,
    totalCost: estimateCost(model, promptTokens, completionTokens),
  }
}
