import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import express from 'express'
import next from 'next'
import JSON5 from 'json5'
import { createTask, deleteTask, getDistinctAgents, getGraph, getRecentEvents, getRunEvents, getRuns, getSessions, getTask, insertEvent, listTasks, updateAutoTaskStatusByRun, updateTaskFields, updateTaskSessionKey, updateTaskSourceRunId, updateTaskStatus, updateTaskTags, upsertAutoTaskForRun, upsertExec, upsertRun, upsertSession, getAnalytics, listSchedules, createSchedule, deleteSchedule, updateScheduleLastRun } from './db.js'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const cronParser = require('cron-parser')
import { loadConfig } from './config.js'
import { HostManager } from './host-manager.js'
import { inferSessionFromListRow, parseGatewayEvent } from './parser.js'
import { buildCapabilities, buildPolicyContext, createDangerousActionsMiddleware } from './security.js'
import type { Diagnostics, ParsedEnvelope, TaskStatus } from './types.js'

const execAsync = promisify(exec)

const config = loadConfig()
const PORT = config.port
const HOST = config.host
const MAX_QUEUE = Number(process.env.OPS_UI_MAX_QUEUE || 5000)
const NOISY_EVENT_BACKPRESSURE_DROP = true
const RUNTIME_HOST_OVERRIDES_PATH = path.resolve(process.cwd(), 'data', 'host-overrides.json')
const RUNTIME_DASHBOARD_AUTH_PATH = path.resolve(process.cwd(), 'data', 'dashboard-auth.json')
const ALLOW_REMOTE_BOOTSTRAP = ['1', 'true', 'yes', 'on'].includes((process.env.OPS_UI_ALLOW_REMOTE_BOOTSTRAP || '').trim().toLowerCase())

const app = express()
if (config.trustProxy) {
  app.set('trust proxy', 1)
}
app.use(express.json({ limit: '256kb' }))

// --- Security Headers ---
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})

// --- Rate Limiting (simple in-memory per IP) ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 300 // max requests per minute per IP

app.use((req, res, next) => {
  // Skip rate limiting for SSE and static assets
  if (req.path === '/api/monitor/events' || !req.path.startsWith('/api/')) {
    return next()
  }
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  let entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
    rateLimitMap.set(ip, entry)
  }
  entry.count++
  if (entry.count > RATE_LIMIT_MAX) {
    res.status(429).json({ ok: false, error: 'Too many requests. Please slow down.' })
    return
  }
  next()
})

// Clean up rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip)
  }
}, 300_000)

type RuntimeDashboardAuth = {
  authEnabled?: boolean
  bearerToken?: string
  configuredAt?: number
}

type DashboardAuthState = {
  authEnabled: boolean
  bearerToken?: string
  source: 'env' | 'runtime' | 'bootstrap'
}

function readRuntimeDashboardAuth(): RuntimeDashboardAuth {
  try {
    if (!fs.existsSync(RUNTIME_DASHBOARD_AUTH_PATH)) return {}
    return JSON.parse(fs.readFileSync(RUNTIME_DASHBOARD_AUTH_PATH, 'utf8')) as RuntimeDashboardAuth
  } catch (error) {
    console.warn('[ops-ui] failed to read dashboard auth runtime state:', error instanceof Error ? error.message : String(error))
    return {}
  }
}

function writeRuntimeDashboardAuth(value: RuntimeDashboardAuth): void {
  fs.mkdirSync(path.dirname(RUNTIME_DASHBOARD_AUTH_PATH), { recursive: true })
  fs.writeFileSync(RUNTIME_DASHBOARD_AUTH_PATH, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 })
}

let runtimeDashboardAuth = readRuntimeDashboardAuth()

function getDashboardAuthState(): DashboardAuthState {
  if (config.bearerToken) {
    return {
      authEnabled: config.authEnabled,
      bearerToken: config.bearerToken,
      source: 'env',
    }
  }

  const runtimeToken = runtimeDashboardAuth.bearerToken?.trim()
  if (runtimeToken) {
    return {
      authEnabled: runtimeDashboardAuth.authEnabled ?? config.authEnabled,
      bearerToken: runtimeToken,
      source: 'runtime',
    }
  }

  return {
    authEnabled: false,
    bearerToken: undefined,
    source: 'bootstrap',
  }
}

function getApiBearerFromRequest(req: express.Request): string | undefined {
  const header = req.header('authorization')
  if (header) {
    const [scheme, token] = header.split(/\s+/, 2)
    if (scheme?.toLowerCase() === 'bearer' && token) return token.trim()
  }
  if (typeof req.query.access_token === 'string' && req.query.access_token.trim()) {
    return req.query.access_token.trim()
  }
  const cookieHeader = req.header('cookie')
  if (cookieHeader) {
    const parts = cookieHeader.split(';').map((p) => p.trim())
    const tokenPart = parts.find((p) => p.startsWith('ops_ui_token='))
    if (tokenPart) return decodeURIComponent(tokenPart.slice('ops_ui_token='.length))
  }
  return undefined
}

function isBootstrapSetupOpen(): boolean {
  return getDashboardAuthState().source === 'bootstrap'
}

function isLoopbackRequest(req: express.Request): boolean {
  const ip = (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '')
  return ip === '127.0.0.1' || ip === '::1'
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ops-agent',
    mode: config.mode,
    version: process.env.npm_package_version || '0.0.0',
    bootstrapSetupRequired: isBootstrapSetupOpen(),
  })
})
const requireDangerousActions = createDangerousActionsMiddleware({
  dangerousActionsEnabled: config.dangerousActionsEnabled,
})

app.get('/api/setup/bootstrap-status', (_req, res) => {
  const authState = getDashboardAuthState()
  res.json({
    ok: true,
    bootstrapRequired: authState.source === 'bootstrap',
    mode: config.mode,
    authConfigured: authState.source !== 'bootstrap',
    dangerousActionsEnabled: config.dangerousActionsEnabled,
    authSource: authState.source,
  })
})

app.use('/api', (req, res, next) => {
  if (req.path === '/setup/bootstrap-status') {
    next()
    return
  }
  if (req.path === '/setup/bootstrap' && isBootstrapSetupOpen()) {
    next()
    return
  }
  const authState = getDashboardAuthState()
  if (!authState.authEnabled) {
    next()
    return
  }
  const token = getApiBearerFromRequest(req)
  if (!token || token !== authState.bearerToken) {
    res.status(401).json({ ok: false, error: 'Unauthorized' })
    return
  }
  next()
})

app.get('/skill', (_req, res) => {
  const skillPath = path.resolve(process.cwd(), 'public', 'skill.md')
  if (fs.existsSync(skillPath)) {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
    res.sendFile(skillPath)
  } else {
    res.status(404).send('Skill manifest not found')
  }
})

app.post('/api/system/update', requireDangerousActions, async (_req, res) => {
  try {
    console.log('[ops-ui] Manual update triggered...')
    // Save local changes
    await execAsync('git stash')

    // Pull changes
    const { stdout, stderr } = await execAsync('git pull')

    // Restore local changes (if any)
    try {
      await execAsync('git stash pop')
    } catch {
      // Ignore errors from stash pop if there's nothing to pop or conflicts
      console.warn('[ops-ui] git stash pop failed or nothing to pop.')
    }

    res.json({ success: true, output: stdout || stderr })
  } catch (error: any) {
    console.error('[ops-ui] Manual update failed:', error.message)
    res.status(500).json({ success: false, error: error.message })
  }
})

// --- Settings API ---
const SETTINGS_PATH = path.resolve(process.cwd(), 'data', 'settings.json')

function getSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    return { autoUpdateEnabled: false, autoUpdateIntervalMinutes: 60, lastUpdateAt: 0 }
  }
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'))
  } catch (e) {
    return { autoUpdateEnabled: false, autoUpdateIntervalMinutes: 60, lastUpdateAt: 0 }
  }
}

function saveSettings(settings: any) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true })
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf8')
  } catch (e) {
    console.error('Failed to save settings:', e)
  }
}

app.get('/api/system/settings', (_req, res) => {
  res.json({ ok: true, settings: getSettings() })
})

app.post('/api/system/settings', (req, res) => {
  try {
    const current = getSettings()
    const body = req.body || {}
    const updated = {
      ...current,
      autoUpdateEnabled: typeof body.autoUpdateEnabled === 'boolean' ? body.autoUpdateEnabled : current.autoUpdateEnabled,
      autoUpdateIntervalMinutes: typeof body.autoUpdateIntervalMinutes === 'number' ? body.autoUpdateIntervalMinutes : current.autoUpdateIntervalMinutes
    }
    saveSettings(updated)
    res.json({ ok: true, settings: updated })
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message })
  }
})

// Background loop for auto-updates
setInterval(async () => {
  try {
    const settings = getSettings()
    if (!config.dangerousActionsEnabled) return
    if (settings.autoUpdateEnabled && settings.autoUpdateIntervalMinutes > 0) {
      const now = Date.now()
      const lastUpdateAt = settings.lastUpdateAt || 0
      const intervalMs = settings.autoUpdateIntervalMinutes * 60 * 1000

      if (now - lastUpdateAt >= intervalMs) {
        console.log('[ops-ui] Running scheduled auto-update...')
        try {
          await execAsync('git stash')
          await execAsync('git pull')
          try {
            await execAsync('git stash pop')
          } catch {
            // ignore
          }
          settings.lastUpdateAt = now
          saveSettings(settings)
          console.log('[ops-ui] Auto-update completed successfully.')
        } catch (err: any) {
          console.error('[ops-ui] Auto-update failed:', err.message)
        }
      }
    }
  } catch (e) {
    // ignore
  }
}, 60000) // Check every minute

app.use(express.static(path.resolve(process.cwd(), 'public')))

const MAX_SSE_CONNECTIONS = 50

const hostManager = new HostManager(config.hosts, config.defaultHostId)
let gateway = hostManager.getActiveClient()

type RuntimeHostOverrides = {
  hosts?: Record<string, { gatewayUrl?: string; gatewayToken?: string }>
}

function readRuntimeHostOverrides(): RuntimeHostOverrides {
  try {
    if (!fs.existsSync(RUNTIME_HOST_OVERRIDES_PATH)) return {}
    const raw = fs.readFileSync(RUNTIME_HOST_OVERRIDES_PATH, 'utf8')
    const parsed = JSON.parse(raw) as RuntimeHostOverrides
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    console.warn('[ops-ui] failed to read host overrides:', error instanceof Error ? error.message : String(error))
    return {}
  }
}

function writeRuntimeHostOverrides(data: RuntimeHostOverrides): void {
  fs.mkdirSync(path.dirname(RUNTIME_HOST_OVERRIDES_PATH), { recursive: true })
  fs.writeFileSync(RUNTIME_HOST_OVERRIDES_PATH, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
}

function applyRuntimeHostOverrides(): void {
  const overrides = readRuntimeHostOverrides()
  const hostEntries = overrides.hosts || {}
  for (const [hostId, override] of Object.entries(hostEntries)) {
    if (!override || typeof override !== 'object') continue
    try {
      hostManager.updateHostConnection(hostId, {
        gatewayUrl: typeof override.gatewayUrl === 'string' && override.gatewayUrl.trim() ? override.gatewayUrl.trim() : undefined,
        gatewayToken: typeof override.gatewayToken === 'string' && override.gatewayToken.trim() ? override.gatewayToken.trim() : undefined,
        gatewayTokenSource: 'runtime:data/host-overrides.json',
      })
    } catch (error) {
      console.warn(`[ops-ui] skipped host override for ${hostId}:`, error instanceof Error ? error.message : String(error))
    }
  }
  gateway = hostManager.getActiveClient()
}

applyRuntimeHostOverrides()

app.post('/api/setup/bootstrap', async (req, res) => {
  if (!isBootstrapSetupOpen()) {
    res.status(403).json({ ok: false, error: 'Bootstrap setup is disabled (dashboard token already configured)' })
    return
  }
  if (config.mode === 'remote' && !ALLOW_REMOTE_BOOTSTRAP && !isLoopbackRequest(req)) {
    res.status(403).json({
      ok: false,
      error: 'Remote bootstrap is disabled by default. Run setup from localhost or set OPS_UI_ALLOW_REMOTE_BOOTSTRAP=true temporarily.',
    })
    return
  }
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
    dashboardToken?: string
    gatewayToken?: string
    gatewayUrl?: string
    hostId?: string
    connect?: boolean
  }
  const dashboardToken = typeof body.dashboardToken === 'string' ? body.dashboardToken.trim() : ''
  const gatewayToken = typeof body.gatewayToken === 'string' ? body.gatewayToken.trim() : ''
  const gatewayUrl = typeof body.gatewayUrl === 'string' ? body.gatewayUrl.trim() : ''
  const hostId = typeof body.hostId === 'string' && body.hostId.trim() ? body.hostId.trim() : hostManager.getActiveHostId()
  const connectNow = body.connect !== false
  if (!dashboardToken) {
    res.status(400).json({ ok: false, error: 'dashboardToken is required' })
    return
  }

  let gatewayConnected = false
  let warning: string | undefined
  const previousActiveHostId = hostManager.getActiveHostId()
  let previousHostSnapshot: { gatewayUrl: string; gatewayToken?: string; gatewayTokenSource?: string } | undefined
  let stagedHostOverrideWrite: { hostId: string; gatewayUrl: string; gatewayToken: string } | undefined
  try {
    if (hostId !== hostManager.getActiveHostId()) {
      setActiveHost(hostId)
    }
    if (gatewayToken) {
      const activeHost = hostManager.getHost(hostId)
      const resolvedGatewayUrl = gatewayUrl || activeHost.gatewayUrl
      previousHostSnapshot = {
        gatewayUrl: activeHost.gatewayUrl,
        gatewayToken: activeHost.gatewayToken,
        gatewayTokenSource: activeHost.gatewayTokenSource,
      }
      hostManager.updateHostConnection(hostId, {
        gatewayUrl: resolvedGatewayUrl,
        gatewayToken,
        gatewayTokenSource: 'runtime:data/host-overrides.json',
      })
      if (hostId === hostManager.getActiveHostId()) {
        gateway = hostManager.getActiveClient()
        resetActiveGatewayBuffers()
      }
      stagedHostOverrideWrite = { hostId, gatewayUrl: resolvedGatewayUrl, gatewayToken }
    }
    if (connectNow) {
      await hostManager.connect(hostId)
      gatewayConnected = true
      if (hostId === hostManager.getActiveHostId()) {
        try {
          await refreshSessions()
        } catch (error) {
          if (isMissingScopeError(error)) warning = error instanceof Error ? error.message : String(error)
          else throw error
        }
      }
    }

    runtimeDashboardAuth = {
      authEnabled: true,
      bearerToken: dashboardToken,
      configuredAt: Date.now(),
    }
    writeRuntimeDashboardAuth(runtimeDashboardAuth)

    if (stagedHostOverrideWrite) {
      const overrides = readRuntimeHostOverrides()
      const hosts = overrides.hosts || {}
      hosts[stagedHostOverrideWrite.hostId] = {
        ...(hosts[stagedHostOverrideWrite.hostId] || {}),
        gatewayUrl: stagedHostOverrideWrite.gatewayUrl,
        gatewayToken: stagedHostOverrideWrite.gatewayToken,
      }
      writeRuntimeHostOverrides({ ...overrides, hosts })
    }
  } catch (error) {
    try {
      if (previousHostSnapshot) {
        hostManager.updateHostConnection(hostId, {
          gatewayUrl: previousHostSnapshot.gatewayUrl,
          gatewayToken: previousHostSnapshot.gatewayToken,
          gatewayTokenSource: previousHostSnapshot.gatewayTokenSource,
        })
      }
      if (hostManager.getActiveHostId() !== previousActiveHostId) {
        setActiveHost(previousActiveHostId)
      } else {
        gateway = hostManager.getActiveClient()
      }
    } catch (rollbackError) {
      console.warn('[ops-ui] bootstrap rollback failed:', rollbackError instanceof Error ? rollbackError.message : String(rollbackError))
    }
    res.status(isGatewayUnavailableError(error) ? 503 : 500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      authConfigured: false,
    })
    return
  }

  res.json({
    ok: true,
    authConfigured: true,
    gatewayConnected,
    warning,
    activeHostId: hostManager.getActiveHostId(),
  })
})

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
  const gw = hostManager.getActiveDiagnostics()
  return {
    ...runtimeDiagnostics,
    ...gw,
    parserErrors: runtimeDiagnostics.parserErrors + gw.parserErrors,
    streamGaps: runtimeDiagnostics.streamGaps + gw.streamGaps,
    droppedNoisyEvents: runtimeDiagnostics.droppedNoisyEvents + gw.droppedNoisyEvents,
    queuedEvents: processQueue.length,
  }
}

function resetActiveGatewayBuffers(): void {
  processQueue.length = 0
  lastSeqByEvent = new Map<string, number>()
  gateway.setQueuedEvents(0)
  runtimeDiagnostics.queuedEvents = 0
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
    const derived = deriveTaskTitleFromEvent(parsed)
    const description = deriveTaskDescription(parsed)
    const taskResult = upsertAutoTaskForRun({
      runId: parsed.run.runId,
      sessionKey: parsed.run.sessionKey || parsed.session?.sessionKey,
      title: derived.title,
      description,
      isUserPrompt: derived.isUserPrompt,
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
      runState === 'final' ? 'review' : runState === 'running' ? 'in_progress' : 'planned'
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

function deriveTaskTitleFromEvent(parsed: ParsedEnvelope): { title: string, isUserPrompt: boolean } {
  const sessionKey = parsed.run?.sessionKey || parsed.session?.sessionKey || 'unknown'
  const payload = parsed.event?.payload as {
    message?: any
    data?: any
    input?: any
    prompt?: any
    query?: any
    name?: string
    action?: string
    tool_calls?: any[]
    arguments?: any
  } | undefined

  const isUserPrompt = parsed.event?.kind === 'chat' && payload?.message?.role === 'user'

  // Cerebro topic tracking heuristic
  const toolName = parsed.event?.toolName || payload?.name || payload?.action || payload?.tool_calls?.[0]?.function?.name
  if (toolName && parsed.event?.kind !== 'chat') {
    const rawArgs = payload?.arguments || payload?.tool_calls?.[0]?.function?.arguments
    let argStr = ''
    try {
      if (typeof rawArgs === 'string') {
        const parsedArgs = JSON.parse(rawArgs)
        const firstVal = Object.values(parsedArgs).find(v => typeof v === 'string' && v.trim().length > 0)
        if (typeof firstVal === 'string') argStr = `: "${firstVal.substring(0, 40).replace(/\n/g, ' ')}${firstVal.length > 40 ? '...' : ''}"`
      } else if (typeof rawArgs === 'object') {
        const firstVal = Object.values(rawArgs).find(v => typeof v === 'string' && v.trim().length > 0)
        if (typeof firstVal === 'string') argStr = `: "${firstVal.substring(0, 40).replace(/\n/g, ' ')}${firstVal.length > 40 ? '...' : ''}"`
      }
    } catch { }
    return { title: `Action: ${toolName}${argStr}`, isUserPrompt: false }
  }

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
  let snippet = preferred.length > 0 ? preferred.slice(0, 120) : ''

  if (snippet && !isUserPrompt) {
    // Strip common filler from the start of agent messages
    snippet = snippet.replace(/^(ок|ok|готово|сделал|sure|yes|yeah|here is|here's|i have)\b[,.\- ]*/i, '').trim()
    // Strip starting "я " or "i "
    snippet = snippet.replace(/^(я|i)\b[,.\- ]*/i, '').trim()
    // Capitalize first letter
    if (snippet.length > 0) {
      snippet = snippet.charAt(0).toUpperCase() + snippet.slice(1)
    }
  }

  if (snippet) return { title: snippet, isUserPrompt }
  return { title: `OpenClaw message in ${sessionKey}`, isUserPrompt }
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

hostManager.onActiveEvent((evt) => {
  enqueueGatewayEvent(evt)
})

function isGatewayUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes('gateway is not connected')
}

function setActiveHost(hostId: string): void {
  hostManager.selectHost(hostId)
  gateway = hostManager.getActiveClient()
  resetActiveGatewayBuffers()
  broadcastSse({ type: 'host.changed', hostId, ts: Date.now() })
}

// --- Agent Management API ---

const OPENCLAW_CONFIG_PATH = process.env.OPENCLAW_CONFIG_PATH?.trim() || path.join(os.homedir(), '.openclaw', 'openclaw.json')
const OPENCLAW_SUBAGENTS_PATH = path.join(os.homedir(), '.openclaw', 'subagents', 'runs.json')
const OPENCLAW_AGENTS_DIR = path.join(os.homedir(), '.openclaw', 'agents')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getOpenClawConfig(): any {
  if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) return {}
  return JSON5.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function saveOpenClawConfig(config: any): void {
  fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
}

// Discover agents from filesystem (fallback for agents not listed in config)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function discoverAgentsFromFs(): any[] {
  const discovered: any[] = []
  if (!fs.existsSync(OPENCLAW_AGENTS_DIR)) return discovered

  const entries = fs.readdirSync(OPENCLAW_AGENTS_DIR, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const id = entry.name
    const workspace = path.join(OPENCLAW_AGENTS_DIR, id)

    discovered.push({
      id,
      name: id === 'main' ? 'Main' : id,
      workspace,
      role: id === 'main' ? 'Primary agent' : undefined,
      tags: id === 'main' ? ['builtin', 'primary'] : undefined,
    })
  }
  return discovered
}

app.get('/api/agents', (_req, res) => {
  try {
    const config = getOpenClawConfig()
    const configAgents = (config?.agents?.list || []) as any[]
    const fsAgents = discoverAgentsFromFs()

    // Merge config agents with filesystem agents (config has priority)
    const mergedAgents: any[] = [...configAgents]
    for (const fsAgent of fsAgents) {
      if (!mergedAgents.some(a => a.id === fsAgent.id)) {
        mergedAgents.push(fsAgent)
      }
    }

    // If no agents in local config, derive from sessions (remote gateway scenario)
    if (mergedAgents.length === 0) {
      const discovered = getDistinctAgents()
      const discoveredAgents = discovered.map((d) => ({
        id: d.agentId,
        name: d.agentId,
        discovered: true,
        lastActivityAt: d.lastActivityAt,
        sessionCount: d.sessionCount,
      }))
      res.json({ ok: true, agents: discoveredAgents, subagents: {} })
      return
    }

    // Enhance agents with instructions
    const enhancedAgents = mergedAgents.map((agent: any) => {
      let instructions = ''
      const agentPath = agent.workspace || agent.agentDir

      if (agentPath) {
        try {
          // Normalize path for cross-platform compatibility
          const normalizedPath = path.resolve(agentPath.replace(/\\/g, '/'))
          if (fs.existsSync(normalizedPath)) {
            // Priority: instruction.md > instructions.md > README.md
            const files = ['instruction.md', 'instructions.md', 'README.md', 'README.MD', 'INSTRUCTIONS.MD']
            for (const f of files) {
              const fpath = path.join(normalizedPath, f)
              if (fs.existsSync(fpath)) {
                instructions = fs.readFileSync(fpath, 'utf8')
                break
              }
            }
          }
        } catch (err) {
          console.warn(`Could not read instructions for agent ${agent.id}:`, err)
        }
      }
      return { ...agent, instructions }
    })

    let subagentsRuns = {}
    if (fs.existsSync(OPENCLAW_SUBAGENTS_PATH)) {
      try {
        const subData = JSON5.parse(fs.readFileSync(OPENCLAW_SUBAGENTS_PATH, 'utf8'))
        subagentsRuns = subData?.runs || {}
      } catch { }
    }

    res.json({ ok: true, agents: enhancedAgents, subagents: subagentsRuns })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.put('/api/agents/:id', (req, res) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newName = (req.body as any)?.name
    if (!newName || typeof newName !== 'string') {
      res.status(400).json({ ok: false, error: 'Name is required' })
      return
    }

    const config = getOpenClawConfig()
    if (!config.agents) config.agents = { list: [] }
    if (!config.agents.list) config.agents.list = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agent = config.agents.list.find((a: any) => a.id === req.params.id)
    if (!agent) {
      res.status(404).json({ ok: false, error: 'Agent not found' })
      return
    }

    const oldId = agent.id
    const newId = newName.trim().replace(/[^a-zA-Z0-9а-яА-Я_-]/g, '-').toLowerCase()

    if (!newId) {
      res.status(400).json({ ok: false, error: 'Invalid name' })
      return
    }

    if (newId !== oldId && config.agents.list.some((a: any) => a.id === newId)) {
      res.status(400).json({ ok: false, error: 'Agent with this ID already exists' })
      return
    }

    agent.name = newName.trim()

    if (newId !== oldId) {
      agent.id = newId

      if (agent.workspace && fs.existsSync(agent.workspace)) {
        const newWorkspace = path.join(path.dirname(agent.workspace), newId)
        try {
          fs.renameSync(agent.workspace, newWorkspace)
          agent.workspace = newWorkspace
        } catch (e) {
          console.warn('Could not rename workspace file system path:', e)
        }
      }

      if (agent.agentDir) {
        const parentDir = path.dirname(agent.agentDir)
        if (fs.existsSync(parentDir)) {
          const newParentDir = path.join(path.dirname(parentDir), newId)
          try {
            fs.renameSync(parentDir, newParentDir)
            agent.agentDir = path.join(newParentDir, path.basename(agent.agentDir))
          } catch (e) {
            console.warn('Could not rename agentDir file system path:', e)
          }
        }
      }
    }

    saveOpenClawConfig(config)
    res.json({ ok: true, agent })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/agents/:id/export', (req, res) => {
  try {
    const config = getOpenClawConfig()
    if (!config.agents?.list) {
      res.status(404).json({ ok: false, error: 'No agents found' })
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agent = config.agents.list.find((a: any) => a.id === req.params.id)
    if (!agent) {
      res.status(404).json({ ok: false, error: 'Agent not found' })
      return
    }

    const exportPath = agent.workspace || agent.agentDir
    if (!exportPath || !fs.existsSync(exportPath)) {
      res.status(404).json({ ok: false, error: 'Agent directory not found' })
      return
    }

    // Path traversal protection: ensure exportPath is within home directory
    const resolvedExportPath = path.resolve(exportPath)
    const homeDir = os.homedir()
    if (!resolvedExportPath.startsWith(homeDir)) {
      res.status(403).json({ ok: false, error: 'Access denied: path outside home directory' })
      return
    }

    const files = fs.readdirSync(resolvedExportPath)
    const mdFiles = files.filter(f => f.toLowerCase().endsWith('.md'))

    const fileContents: Record<string, string> = {}
    for (const file of mdFiles) {
      // Sanitize: only allow simple filenames without path separators
      if (file.includes('/') || file.includes('\\') || file.includes('..')) continue
      try {
        const filePath = path.join(resolvedExportPath, file)
        // Double check the resolved file path is still within the export directory
        if (!path.resolve(filePath).startsWith(resolvedExportPath)) continue
        const content = fs.readFileSync(filePath, 'utf8')
        fileContents[file] = content
      } catch (err) {
        console.warn(`Could not read ${file} for agent ${agent.id}:`, err)
      }
    }

    res.json({ ok: true, files: fileContents })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.delete('/api/agents/:id', requireDangerousActions, (req, res) => {
  try {
    const config = getOpenClawConfig()
    if (!config.agents?.list) {
      res.status(404).json({ ok: false, error: 'No agents found' })
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const idx = config.agents.list.findIndex((a: any) => a.id === req.params.id)
    if (idx < 0) {
      res.status(404).json({ ok: false, error: 'Agent not found' })
      return
    }

    config.agents.list.splice(idx, 1)
    saveOpenClawConfig(config)
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

// --- End Agent API ---

app.get('/api/system/capabilities', (_req, res) => {
  const authState = getDashboardAuthState()
  res.json(buildCapabilities({
    mode: config.mode,
    authEnabled: authState.authEnabled,
    dangerousActionsEnabled: config.dangerousActionsEnabled,
    defaultHostId: config.defaultHostId,
    multiHost: config.hosts.length > 1,
  }))
})

app.get('/api/hosts', (_req, res) => {
  res.json({
    ok: true,
    hosts: hostManager.listHosts(),
    activeHostId: hostManager.getActiveHostId(),
    policy: buildPolicyContext({
      mode: config.mode,
      authEnabled: config.authEnabled,
      dangerousActionsEnabled: config.dangerousActionsEnabled,
    }),
  })
})

app.post('/api/hosts/select', (req, res) => {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { hostId?: string }
  const hostId = typeof body.hostId === 'string' ? body.hostId.trim() : ''
  if (!hostId) {
    res.status(400).json({ ok: false, error: 'hostId is required' })
    return
  }
  try {
    setActiveHost(hostId)
    res.json({ ok: true, activeHostId: hostManager.getActiveHostId() })
  } catch (error) {
    res.status(404).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/hosts/:id/connect', async (req, res) => {
  const hostId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  try {
    await hostManager.connect(hostId)
    if (hostId === hostManager.getActiveHostId()) {
      try {
        await refreshSessions()
      } catch (error) {
        if (isMissingScopeError(error)) {
          res.json({ ok: true, connected: true, warning: error instanceof Error ? error.message : String(error) })
          return
        }
        throw error
      }
    }
    res.json({ ok: true, connected: true, hostId })
  } catch (error) {
    const status = isGatewayUnavailableError(error) ? 503 : 500
    res.status(status).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/hosts/:id/disconnect', requireDangerousActions, (req, res) => {
  const hostId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  try {
    hostManager.disconnect(hostId)
    res.json({ ok: true, hostId })
  } catch (error) {
    res.status(404).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/hosts/:id/credentials', requireDangerousActions, async (req, res) => {
  const hostId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
    gatewayUrl?: string
    gatewayToken?: string
    connect?: boolean
  }
  const gatewayUrl = typeof body.gatewayUrl === 'string' ? body.gatewayUrl.trim() : ''
  const gatewayToken = typeof body.gatewayToken === 'string' ? body.gatewayToken.trim() : ''
  const connectNow = body.connect !== false
  if (!gatewayToken) {
    res.status(400).json({ ok: false, error: 'gatewayToken is required' })
    return
  }
  try {
    const currentHost = hostManager.getHost(hostId)
    const resolvedGatewayUrl = gatewayUrl || currentHost.gatewayUrl
    try {
      // Validate URL early for cleaner UI errors.
      const url = new URL(resolvedGatewayUrl)
      if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
        res.status(400).json({ ok: false, error: 'gatewayUrl must use ws:// or wss://' })
        return
      }
    } catch (error) {
      res.status(400).json({ ok: false, error: `Invalid gatewayUrl: ${error instanceof Error ? error.message : String(error)}` })
      return
    }

    hostManager.updateHostConnection(hostId, {
      gatewayUrl: resolvedGatewayUrl,
      gatewayToken,
      gatewayTokenSource: 'runtime:data/host-overrides.json',
    })
    if (hostId === hostManager.getActiveHostId()) {
      gateway = hostManager.getActiveClient()
      resetActiveGatewayBuffers()
      broadcastSse({ type: 'host.changed', hostId, ts: Date.now() })
    }

    const overrides = readRuntimeHostOverrides()
    const hosts = overrides.hosts || {}
    hosts[hostId] = {
      ...(hosts[hostId] || {}),
      gatewayUrl: resolvedGatewayUrl,
      gatewayToken,
    }
    writeRuntimeHostOverrides({ ...overrides, hosts })

    let warning: string | undefined
    let connected = false
    if (connectNow) {
      await hostManager.connect(hostId)
      connected = true
      if (hostId === hostManager.getActiveHostId()) {
        try {
          await refreshSessions()
        } catch (error) {
          if (isMissingScopeError(error)) {
            warning = error instanceof Error ? error.message : String(error)
          } else {
            throw error
          }
        }
      }
    }

    res.json({
      ok: true,
      hostId,
      connected,
      warning,
      activeHostId: hostManager.getActiveHostId(),
    })
  } catch (error) {
    const status = isGatewayUnavailableError(error) ? 503 : 500
    res.status(status).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
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
    activeHostId: hostManager.getActiveHostId(),
    // gatewayUrl intentionally redacted for security
    parserSchemaVersion: 1,
  })
})

app.get('/api/analytics', (req, res) => {
  const rawDays = req.query.days ? Number(req.query.days) : 30
  const days = Math.max(1, Math.min(365, Number.isFinite(rawDays) ? rawDays : 30))
  try {
    const data = getAnalytics(days)
    res.json({ ok: true, data })
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})

app.get('/api/tasks', (_req, res) => {
  const tasks = listTasks(1000)
  res.json({ tasks, count: tasks.length })
})

app.post('/api/tasks/:id/status', (req, res) => {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { status?: string, sessionKey?: string }
  const status = body.status || ''
  if (!['planned', 'in_progress', 'waiting_approval', 'review', 'done'].includes(status)) {
    res.status(400).json({ ok: false, error: 'Invalid status' })
    return
  }
  const ok = updateTaskStatus({ id: req.params.id, status: status as TaskStatus })
  if (!ok) {
    res.status(404).json({ ok: false, error: 'Task not found' })
    return
  }

  const task = getTask(req.params.id)
  if (task) {
    // Determine the target session key
    let targetSessionKey = body.sessionKey || task.sessionKey
    if (status === 'in_progress' && !targetSessionKey) {
      targetSessionKey = 'agent:main:main' // Default fallback
    }

    // Persist the session key if it's new or was just assigned
    if (targetSessionKey && targetSessionKey !== task.sessionKey) {
      updateTaskSessionKey({ id: req.params.id, sessionKey: targetSessionKey })
      task.sessionKey = targetSessionKey
    }
  }

  broadcastSse({ type: 'task_updated', taskId: req.params.id, status, ts: Date.now() })

  if (status === 'in_progress' && gateway.isConnected() && task?.sessionKey) {
    const idempotencyKey = `task-dispatch:${req.params.id}:${Date.now()}`

    // Link this run to the original task BEFORE dispatching so that
    // when events arrive, upsertAutoTaskForRun finds and updates this task
    updateTaskSourceRunId({ id: req.params.id, runId: idempotencyKey })

    console.log(`[ops-ui] dispatching task "${task.title}" to session ${task.sessionKey}`)
    gateway
      .request('chat.send', {
        sessionKey: task.sessionKey,
        idempotencyKey,
        message: [task.title, task.description].filter(Boolean).join('\n\n'),
      })
      .then(() => console.log(`[ops-ui] chat.send succeeded for task ${req.params.id}`))
      .catch((err: unknown) =>
        console.warn('[ops-ui] chat.send failed:', err instanceof Error ? err.message : err),
      )
  }
  res.json({ ok: true })
})

app.get('/api/monitor/events', (req, res) => {
  // Limit concurrent SSE connections
  if (sseClients.size >= MAX_SSE_CONNECTIONS) {
    res.status(503).json({ ok: false, error: 'Too many SSE connections' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now(), hostId: hostManager.getActiveHostId() })}\n\n`)
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
    await hostManager.connect(hostManager.getActiveHostId())
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
    const status = isGatewayUnavailableError(error) ? 503 : 500
    res.status(status).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/monitor/disconnect', (_req, res) => {
  hostManager.disconnect(hostManager.getActiveHostId())
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
    const status = isGatewayUnavailableError(error) ? 503 : 500
    res.status(status).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/monitor/abort', requireDangerousActions, async (req, res) => {
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
    const status = isGatewayUnavailableError(error) ? 503 : 500
    res.status(status).json({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

app.post('/api/tasks', (req, res) => {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
    title?: string
    description?: string
    sessionKey?: string
    tags?: string[]
    topic?: string
  }
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 500) : ''
  if (!title) {
    res.status(400).json({ ok: false, error: 'title is required' })
    return
  }
  const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 5000) : undefined
  const tags = Array.isArray(body.tags)
    ? body.tags.filter(t => typeof t === 'string' && t.trim()).slice(0, 20).map(t => t.trim().slice(0, 50))
    : []
  const topic = typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim().slice(0, 100) : undefined
  const id = `task:manual:${randomUUID()}`
  createTask({
    id,
    title,
    description,
    sessionKey: typeof body.sessionKey === 'string' && body.sessionKey.trim() ? body.sessionKey.trim().slice(0, 200) : undefined,
    autoGenerated: false,
    status: 'planned',
    tags,
    topic,
  })
  broadcastSse({ type: 'task_created', taskId: id, ts: Date.now() })
  res.json({ ok: true, taskId: id })
})

app.put('/api/tasks/:id', (req, res) => {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
    title?: string
    description?: string
    topic?: string
  }
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) {
    res.status(400).json({ ok: false, error: 'title is required' })
    return
  }
  const ok = updateTaskFields({
    id: req.params.id,
    title,
    description: typeof body.description === 'string' ? body.description.trim() : undefined,
    topic: typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim().slice(0, 100) : undefined,
  })
  if (!ok) {
    res.status(404).json({ ok: false, error: 'Task not found' })
    return
  }
  broadcastSse({ type: 'task_updated', taskId: req.params.id, ts: Date.now() })
  res.json({ ok: true })
})

app.put('/api/tasks/:id/tags', (req, res) => {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { tags?: string[] }
  const tags = Array.isArray(body.tags)
    ? body.tags.filter(t => typeof t === 'string' && t.trim()).slice(0, 20).map(t => t.trim().slice(0, 50))
    : []
  const ok = updateTaskTags(req.params.id, tags)
  if (!ok) {
    res.status(404).json({ ok: false, error: 'Task not found' })
    return
  }
  broadcastSse({ type: 'task_updated', taskId: req.params.id, ts: Date.now() })
  res.json({ ok: true })
})

app.post('/api/tasks/:id/approval', (req, res) => {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { action?: string }
  const action = body.action
  if (action !== 'approve' && action !== 'reject') {
    res.status(400).json({ ok: false, error: 'action must be "approve" or "reject"' })
    return
  }
  const task = getTask(req.params.id)
  if (!task) {
    res.status(404).json({ ok: false, error: 'Task not found' })
    return
  }

  if (task.sessionKey && gateway.isConnected()) {
    const idempotencyKey = `approval:${req.params.id}:${Date.now()}`
    const message = action === 'approve' ? 'Approved. Please proceed.' : 'Rejected. Please stop or ask for clarification.'

    gateway.request('chat.send', {
      sessionKey: task.sessionKey,
      idempotencyKey,
      message,
    }).catch(console.error)
  }

  const newStatus = action === 'approve' ? 'in_progress' : 'review'
  updateTaskStatus({ id: req.params.id, status: newStatus })
  broadcastSse({ type: 'task_updated', taskId: req.params.id, status: newStatus, ts: Date.now() })

  res.json({ ok: true })
})

app.delete('/api/tasks/:id', requireDangerousActions, (req, res) => {
  const taskId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  const ok = deleteTask(taskId)
  if (!ok) {
    res.status(404).json({ ok: false, error: 'Task not found' })
    return
  }
  broadcastSse({ type: 'task_deleted', taskId, ts: Date.now() })
  res.json({ ok: true })
})

app.get('/api/schedules', (_req, res) => {
  res.json({ ok: true, schedules: listSchedules() })
})

app.post('/api/schedules', (req, res) => {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as { cronExpr?: string; sessionKey?: string; prompt?: string }
  const cronExpr = typeof body.cronExpr === 'string' ? body.cronExpr.trim().slice(0, 100) : ''
  const sessionKey = typeof body.sessionKey === 'string' ? body.sessionKey.trim().slice(0, 200) : ''
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 2000) : ''
  if (!cronExpr || !sessionKey || !prompt) {
    res.status(400).json({ ok: false, error: 'Missing required fields (cronExpr, sessionKey, prompt)' })
    return
  }
  try {
    cronParser.parseExpression(cronExpr)
    const id = `sched:${randomUUID()}`
    createSchedule({ id, cronExpr, sessionKey, prompt })
    res.json({ ok: true, id })
  } catch (err) {
    res.status(400).json({ ok: false, error: 'Invalid cron expression' })
  }
})

app.delete('/api/schedules/:id', requireDangerousActions, (req, res) => {
  const scheduleId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  const ok = deleteSchedule(scheduleId)
  res.json({ ok })
})

const dev = process.env.NODE_ENV !== 'production'
const nextApp = next({ dev })
const nextHandler = nextApp.getRequestHandler()

nextApp.prepare().then(() => {
  app.use((req, res) => {
    return nextHandler(req, res)
  })

  app.listen(PORT, HOST, async () => {
    const isAnyIPv4 = HOST === '0.0.0.0'
    const isAnyIPv6 = HOST === '::'
    const isAny = isAnyIPv4 || isAnyIPv6

    if (isAny) {
      console.log(`[ops-ui] listening on:`)
      console.log(`  - Local:   http://localhost:${PORT}`)
      const interfaces = os.networkInterfaces()
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
          if (iface.family === 'IPv4' && !iface.internal) {
            console.log(`  - Network: http://${iface.address}:${PORT}`)
          }
        }
      }
    } else {
      console.log(`[ops-ui] listening on http://${HOST}:${PORT}`)
    }
    console.log(`[ops-ui] mode=${config.mode} auth=${config.authEnabled ? 'on' : 'off'} dangerous=${config.dangerousActionsEnabled ? 'on' : 'off'}`)
    const authState = getDashboardAuthState()
    console.log(`[ops-ui] dashboard auth source=${authState.source} enabled=${authState.authEnabled ? 'yes' : 'no'}`)
    console.log(`[ops-ui] hosts: ${config.hosts.map((h) => `${h.id}=${h.gatewayUrl} (${h.gatewayToken ? `token:${h.gatewayTokenSource || 'yes'}` : `no-token:${h.gatewayTokenSource || 'n/a'}`})`).join(', ')}`)
    console.log(`[ops-ui] active host: ${hostManager.getActiveHostId()}`)
    try {
      await hostManager.connect(hostManager.getActiveHostId())
      console.log(`[ops-ui] connected to gateway (${hostManager.getActiveHostId()})`)
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

    setInterval(() => {
      try {
        const schedules = listSchedules()
        const now = Date.now()
        for (const sched of schedules) {
          if (!sched.lastRunAt) {
            updateScheduleLastRun(sched.id, now)
            continue
          }
          try {
            const interval = cronParser.parseExpression(sched.cronExpr, { currentDate: new Date(sched.lastRunAt) })
            const nextTarget = interval.next().getTime()
            if (now >= nextTarget) {
              updateScheduleLastRun(sched.id, now)
              if (gateway.isConnected()) {
                const idempotencyKey = `cron:${sched.id}:${now}`
                console.log(`[ops-ui] executing cron ${sched.id} for session ${sched.sessionKey}`)

                const taskId = `task:cron:${randomUUID()}`
                createTask({
                  id: taskId,
                  title: `Scheduled Task: ${sched.prompt.substring(0, 30)}...`,
                  description: sched.prompt,
                  sessionKey: sched.sessionKey,
                  status: 'in_progress',
                  sourceRunId: idempotencyKey,
                  autoGenerated: true,
                  tags: ['cron-job']
                })

                gateway.request('chat.send', {
                  sessionKey: sched.sessionKey,
                  idempotencyKey,
                  message: sched.prompt,
                }).catch(console.error)
              }
            }
          } catch (e) {
            console.warn(`Cron error for ${sched.id}: `, e)
          }
        }
      } catch (e) {
        console.error('Cron loop error:', e)
      }
    }, 60000)
  })
}).catch((err: unknown) => {
  console.error('[ops-ui] Next.js preparation failed:', err)
  process.exit(1)
})
