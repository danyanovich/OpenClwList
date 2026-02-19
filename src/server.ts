import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import JSON5 from 'json5'
import { getGraph, getRecentEvents, getRunEvents, getRuns, getSessions, insertEvent, listTasks, updateAutoTaskStatusByRun, updateTaskStatus, upsertAutoTaskForRun, upsertExec, upsertRun, upsertSession } from './db.js'
import { GatewayClient } from './gateway-client.js'
import { inferSessionFromListRow, parseGatewayEvent } from './parser.js'
import type { Diagnostics, MonitorEvent, ParsedEnvelope, TaskStatus } from './types.js'

const PORT = Number(process.env.PORT || 3010)
const HOST = process.env.HOST || '0.0.0.0'
const GATEWAY_URL = process.env.CLAWDBOT_URL || 'ws://127.0.0.1:18789'
const MAX_QUEUE = Number(process.env.OPS_UI_MAX_QUEUE || 5000)
const NOISY_EVENT_BACKPRESSURE_DROP = true

function detectGatewayToken(): { token?: string; source: string } {
  const envToken = process.env.CLAWDBOT_API_TOKEN?.trim()
  if (envToken) {
    return { token: envToken, source: 'env:CLAWDBOT_API_TOKEN' }
  }

  const configPath = process.env.OPENCLAW_CONFIG_PATH?.trim() || path.join(os.homedir(), '.openclaw', 'openclaw.json')
  if (!fs.existsSync(configPath)) {
    return { source: `not found: ${configPath}` }
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8')
    const parsed = JSON5.parse(raw) as { gateway?: { auth?: { token?: string } } }
    const token = parsed?.gateway?.auth?.token?.trim()
    if (token) {
      return { token, source: `config:${configPath}` }
    }
    return { source: `token missing in ${configPath}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { source: `parse error in ${configPath}: ${message}` }
  }
}

const TOKEN_DETECTION = detectGatewayToken()
const GATEWAY_TOKEN = TOKEN_DETECTION.token

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use(express.static(path.resolve(process.cwd(), 'public')))

const gateway = new GatewayClient(GATEWAY_URL, GATEWAY_TOKEN)

const sseClients = new Set<express.Response>()
const processQueue: Array<{ event: string; payload?: unknown; seq?: number }> = []
let isProcessing = false
let lastSeqByEvent = new Map<string, number>()

const runtimeDiagnostics: Diagnostics = {
  connected: false,
  reconnectAttempts: 0,
  parserErrors: 0,
  streamGaps: 0,
  droppedNoisyEvents: 0,
  queuedEvents: 0,
}

function mergeDiagnostics(): Diagnostics {
  const gw = gateway.getDiagnostics()
  return {
    ...runtimeDiagnostics,
    ...gw,
    parserErrors: runtimeDiagnostics.parserErrors + gw.parserErrors,
    streamGaps: runtimeDiagnostics.streamGaps + gw.streamGaps,
    droppedNoisyEvents: runtimeDiagnostics.droppedNoisyEvents + gw.droppedNoisyEvents,
    queuedEvents: processQueue.length,
  }
}

function broadcastSse(payload: unknown): void {
  const data = `data: ${JSON.stringify(payload)}\n\n`
  for (const client of sseClients) {
    try {
      client.write(data)
    } catch {
      sseClients.delete(client)
    }
  }
}

function enqueueGatewayEvent(envelope: { event: string; payload?: unknown; seq?: number }): void {
  const isNoisyDelta = envelope.event === 'chat' && typeof envelope.payload === 'object' && envelope.payload != null && (envelope.payload as { state?: unknown }).state === 'delta'

  if (processQueue.length >= MAX_QUEUE) {
    if (NOISY_EVENT_BACKPRESSURE_DROP && isNoisyDelta) {
      gateway.addDroppedNoisy(1)
      runtimeDiagnostics.droppedNoisyEvents += 1
      return
    }
    processQueue.shift()
  }

  processQueue.push(envelope)
  gateway.setQueuedEvents(processQueue.length)
  void processQueueLoop()
}

function persistParsed(parsed: ParsedEnvelope): void {
  if (parsed.session?.sessionKey && parsed.session.agentId && parsed.session.channel && parsed.session.status && parsed.session.lastActivityAt) {
    upsertSession({
      sessionKey: parsed.session.sessionKey,
      agentId: parsed.session.agentId,
      channel: parsed.session.channel,
      status: parsed.session.status,
      lastActivityAt: parsed.session.lastActivityAt,
      spawnedBy: parsed.session.spawnedBy,
    })
  }

  if (parsed.run?.runId) {
    const existingSessionKey = parsed.run.sessionKey || parsed.session?.sessionKey || 'unknown'
    upsertRun({
      runId: parsed.run.runId,
      sessionKey: existingSessionKey,
      state: parsed.run.state || 'running',
      startedAt: parsed.run.startedAt || Date.now(),
      endedAt: parsed.run.endedAt,
      error: parsed.run.error,
      lastSeq: parsed.run.lastSeq,
    })
  }

  if (parsed.event) {
    insertEvent(parsed.event)
  }

  if (parsed.exec) {
    upsertExec(parsed.exec)
  }

  if (parsed.run?.runId) {
    const title = deriveTaskTitleFromEvent(parsed)
    const description = deriveTaskDescription(parsed)
    const taskResult = upsertAutoTaskForRun({
      runId: parsed.run.runId,
      sessionKey: parsed.run.sessionKey || parsed.session?.sessionKey,
      title,
      description,
    })
    if (taskResult.created) {
      broadcastSse({
        type: 'task_created',
        taskId: taskResult.taskId,
        runId: parsed.run.runId,
        ts: Date.now(),
      })
    } else if (taskResult.updated) {
      broadcastSse({
        type: 'task_updated',
        taskId: taskResult.taskId,
        runId: parsed.run.runId,
        ts: Date.now(),
      })
    }

    const runState = parsed.run.state || 'running'
    const targetStatus: TaskStatus =
      runState === 'final' ? 'done' : runState === 'running' ? 'in_progress' : 'todo'
    const statusChanged = updateAutoTaskStatusByRun({ runId: parsed.run.runId, status: targetStatus })
    if (statusChanged) {
      broadcastSse({
        type: 'task_updated',
        runId: parsed.run.runId,
        status: targetStatus,
        ts: Date.now(),
      })
    }
  }
}

function extractTextFromUnknownMessage(message: unknown): string {
  if (!message) return ''
  if (typeof message === 'string') return message.trim()
  if (typeof message !== 'object') return ''
  const msg = message as Record<string, unknown>
  if (typeof msg.text === 'string') return msg.text.trim()
  if (typeof msg.input === 'string') return msg.input.trim()
  if (typeof msg.prompt === 'string') return msg.prompt.trim()
  if (typeof msg.query === 'string') return msg.query.trim()
  const content = msg.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      const b = block as Record<string, unknown>
      if (typeof b.text === 'string') parts.push(b.text.trim())
      if (typeof b.content === 'string') parts.push(b.content.trim())
      if (typeof b.input === 'string') parts.push(b.input.trim())
    }
    return parts.filter(Boolean).join(' ').trim()
  }
  if (Array.isArray(msg.messages)) {
    const parts: string[] = []
    for (const item of msg.messages) {
      const text = extractTextFromUnknownMessage(item)
      if (text) parts.push(text)
    }
    return parts.join(' ').trim()
  }
  return ''
}

function deriveTaskTitleFromEvent(parsed: ParsedEnvelope): string {
  const sessionKey = parsed.run?.sessionKey || parsed.session?.sessionKey || 'unknown'
  const payload = parsed.event?.payload as {
    message?: unknown
    data?: Record<string, unknown>
    input?: unknown
    prompt?: unknown
    query?: unknown
  } | undefined
  const fromMessage = extractTextFromUnknownMessage(payload?.message)
  const fromData = payload?.data ? extractTextFromUnknownMessage(payload.data) : ''
  const fromInput = extractTextFromUnknownMessage(payload?.input)
  const fromPrompt = extractTextFromUnknownMessage(payload?.prompt)
  const fromQuery = extractTextFromUnknownMessage(payload?.query)
  const raw = (fromMessage || fromData || fromInput || fromPrompt || fromQuery).replace(/\s+/g, ' ').trim()
  const firstLine = raw.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0) || ''
  const cleaned = (firstLine || raw)
    .replace(/^[#>*\-\d.\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned
  const preferred = firstSentence.length >= 12 ? firstSentence : cleaned
  const snippet = preferred.length > 0 ? preferred.slice(0, 120) : ''
  if (snippet) return snippet
  return `OpenClaw message in ${sessionKey}`
}

function deriveTaskDescription(parsed: ParsedEnvelope): string {
  const runId = parsed.run?.runId || 'unknown'
  const sessionKey = parsed.run?.sessionKey || parsed.session?.sessionKey || 'unknown'
  return `Auto-created from OpenClaw run ${runId} in session ${sessionKey}.`
}

async function processQueueLoop(): Promise<void> {
  if (isProcessing) return
  isProcessing = true
  try {
    while (processQueue.length > 0) {
      const current = processQueue.shift()!
      gateway.setQueuedEvents(processQueue.length)
      const lastSeq = lastSeqByEvent.get(current.event)
      if (typeof current.seq === 'number' && typeof lastSeq === 'number' && current.seq > lastSeq + 1) {
        gateway.incrementStreamGaps()
        runtimeDiagnostics.streamGaps += 1
        broadcastSse({
          type: 'diagnostic',
          level: 'warn',
          code: 'stream_gap',
          event: current.event,
          expected: lastSeq + 1,
          received: current.seq,
          ts: Date.now(),
        })
      }
      if (typeof current.seq === 'number') {
        lastSeqByEvent.set(current.event, current.seq)
      }

      try {
        const parsed = parseGatewayEvent(current.event, current.payload, current.seq)
        if (!parsed) continue
        persistParsed(parsed)

        const pushed: Record<string, unknown> = {
          type: 'monitor_update',
          ts: Date.now(),
        }
        if (parsed.session?.sessionKey) pushed.sessionKey = parsed.session.sessionKey
        if (parsed.run?.runId) pushed.runId = parsed.run.runId
        if (parsed.event?.eventId) pushed.eventId = parsed.event.eventId
        if (parsed.exec?.execId) pushed.execId = parsed.exec.execId
        broadcastSse(pushed)
      } catch (error) {
        gateway.incrementParserErrors()
        runtimeDiagnostics.parserErrors += 1
        runtimeDiagnostics.lastError = error instanceof Error ? error.message : String(error)
        broadcastSse({
          type: 'diagnostic',
          level: 'error',
          code: 'parser_error',
          message: runtimeDiagnostics.lastError,
          event: current.event,
          ts: Date.now(),
        })
      }
    }
  } finally {
    isProcessing = false
  }
}

async function refreshSessions(): Promise<void> {
  type SessionsResult = { sessions?: Array<Record<string, unknown>> }
  const result = await gateway.request<SessionsResult>('sessions.list', {
    limit: 500,
    activeMinutes: 1440,
    includeLastMessage: false,
  })

  for (const row of result.sessions || []) {
    const parsed = inferSessionFromListRow(row)
    if (!parsed) continue
    upsertSession(parsed)
  }

  broadcastSse({ type: 'monitor_refresh', ts: Date.now(), sessions: (result.sessions || []).length })
}

function isMissingScopeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes('missing scope')
}

gateway.onEvent((evt) => {
  enqueueGatewayEvent(evt)
})

app.get('/api/monitor/sessions', (req, res) => {
  const from = req.query.from ? Number(req.query.from) : undefined
  const to = req.query.to ? Number(req.query.to) : undefined
  const sessions = getSessions({
    agentId: typeof req.query.agentId === 'string' ? req.query.agentId : undefined,
    channel: typeof req.query.channel === 'string' ? req.query.channel : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    from,
    to,
  })
  res.json({ sessions, count: sessions.length })
})

app.get('/api/monitor/runs', (req, res) => {
  const from = req.query.from ? Number(req.query.from) : undefined
  const to = req.query.to ? Number(req.query.to) : undefined
  const runs = getRuns({
    sessionKey: typeof req.query.sessionKey === 'string' ? req.query.sessionKey : undefined,
    agentId: typeof req.query.agentId === 'string' ? req.query.agentId : undefined,
    from,
    to,
  })
  res.json({ runs, count: runs.length })
})

app.get('/api/monitor/runs/:runId/events', (req, res) => {
  const events = getRunEvents(req.params.runId)
  res.json({ events, count: events.length })
})

app.get('/api/monitor/graph', (req, res) => {
  const windowSec = req.query.window ? Number(req.query.window) : 3600
  const graph = getGraph(Math.max(60, windowSec) * 1000)
  res.json(graph)
})

app.get('/api/monitor/diagnostics', (_req, res) => {
  res.json({
    diagnostics: mergeDiagnostics(),
    recentEvents: getRecentEvents(100),
    gatewayUrl: GATEWAY_URL,
    parserSchemaVersion: 1,
  })
})

app.get('/api/tasks', (_req, res) => {
  const tasks = listTasks(1000)
  res.json({ tasks, count: tasks.length })
})

app.post('/api/tasks/:id/status', (req, res) => {
  const status = (req.body && typeof req.body === 'object' ? (req.body as { status?: string }).status : '') || ''
  if (!['todo', 'in_progress', 'done'].includes(status)) {
    res.status(400).json({ ok: false, error: 'Invalid status' })
    return
  }
  const ok = updateTaskStatus({ id: req.params.id, status: status as TaskStatus })
  if (!ok) {
    res.status(404).json({ ok: false, error: 'Task not found' })
    return
  }
  broadcastSse({ type: 'task_updated', taskId: req.params.id, status, ts: Date.now() })
  res.json({ ok: true })
})

app.get('/api/monitor/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`)
  sseClients.add(res)

  const heartbeat = setInterval(() => {
    try {
      res.write(`event: ping\ndata: ${Date.now()}\n\n`)
    } catch {
      sseClients.delete(res)
      clearInterval(heartbeat)
    }
  }, 15000)

  req.on('close', () => {
    clearInterval(heartbeat)
    sseClients.delete(res)
  })
})

app.post('/api/monitor/connect', async (_req, res) => {
  try {
    await gateway.connect()
    try {
      await refreshSessions()
      res.json({ ok: true, connected: true })
    } catch (error) {
      if (isMissingScopeError(error)) {
        const warning = error instanceof Error ? error.message : String(error)
        res.json({ ok: true, connected: true, warning })
        return
      }
      throw error
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/monitor/disconnect', (_req, res) => {
  gateway.disconnect()
  res.json({ ok: true })
})

app.post('/api/monitor/refresh-sessions', async (_req, res) => {
  try {
    await refreshSessions()
    res.json({ ok: true })
  } catch (error) {
    if (isMissingScopeError(error)) {
      const warning = error instanceof Error ? error.message : String(error)
      res.json({ ok: true, warning })
      return
    }
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/monitor/abort', async (req, res) => {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { sessionKey?: string; runId?: string }
  const sessionKey = typeof body.sessionKey === 'string' ? body.sessionKey : ''
  const runId = typeof body.runId === 'string' ? body.runId : undefined
  if (!sessionKey) {
    res.status(400).json({ ok: false, error: 'sessionKey is required' })
    return
  }
  try {
    const payload = await gateway.request('chat.abort', { sessionKey, runId })
    res.json({ ok: true, payload })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/{*rest}', (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'public', 'index.html'))
})

app.listen(PORT, HOST, async () => {
  console.log(`[ops-ui] listening on http://${HOST}:${PORT}`)
  console.log(
    `[ops-ui] gateway auth: ${GATEWAY_TOKEN ? `token loaded (${TOKEN_DETECTION.source})` : `no token (${TOKEN_DETECTION.source})`}`,
  )
  try {
    await gateway.connect()
    console.log('[ops-ui] connected to gateway')
    try {
      await refreshSessions()
    } catch (error) {
      if (isMissingScopeError(error)) {
        console.warn(
          `[ops-ui] connected, but sessions.list is restricted (${error instanceof Error ? error.message : String(error)}). Live events will still populate monitor.`,
        )
      } else {
        throw error
      }
    }
  } catch (error) {
    console.warn('[ops-ui] gateway connect failed:', error instanceof Error ? error.message : String(error))
  }

  setInterval(() => {
    if (gateway.isConnected()) {
      void refreshSessions().catch((error) => {
        runtimeDiagnostics.lastError = error instanceof Error ? error.message : String(error)
      })
    }
  }, 30_000)
})
