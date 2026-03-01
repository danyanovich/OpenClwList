"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { BrowserGatewayClient } from "../lib/gateway-client"
import {
  parseGatewayEvent,
  extractTokenUsage,
  type MonitorSession,
  type MonitorRun,
  type MonitorEvent,
  type MonitorExec,
  type TokenUsageEntry,
} from "../lib/parser"
import {
  loadTasks,
  upsertAutoTaskForRun,
  updateAutoTaskStatusByRun,
  type TaskItem,
} from "../lib/tasks"
import { deriveTaskTitleFromRun } from "../lib/task-title"

const GATEWAY_URL_KEY = "openclaw_gateway_url"
const GATEWAY_TOKEN_KEY = "openclaw_gateway_token"
const MAX_EVENTS = 2000

export type GatewayContextValue = {
  // Connection
  gatewayUrl: string
  gatewayToken: string
  setConnection: (url: string, token: string) => void
  connected: boolean
  connecting: boolean

  // Live data (built from gateway events)
  sessions: Map<string, MonitorSession>
  runs: Map<string, MonitorRun>
  events: MonitorEvent[]
  execs: Map<string, MonitorExec>
  tokenUsage: TokenUsageEntry[]

  // Tasks (localStorage-backed, updated from gateway events)
  tasks: TaskItem[]
  refreshTasks: () => void

  // RPC
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>
  reconnect: () => void
}

const GatewayContext = createContext<GatewayContextValue | null>(null)

export function useGateway(): GatewayContextValue {
  const ctx = useContext(GatewayContext)
  if (!ctx) throw new Error("useGateway must be used inside GatewayProvider")
  return ctx
}

function readStoredConnection(): { url: string; token: string } {
  if (typeof window === "undefined") return { url: "", token: "" }
  return {
    url: localStorage.getItem(GATEWAY_URL_KEY) ?? "",
    token: localStorage.getItem(GATEWAY_TOKEN_KEY) ?? "",
  }
}

export function GatewayProvider({ children }: { children: React.ReactNode }) {
  const { url: storedUrl, token: storedToken } = readStoredConnection()

  const [gatewayUrl, setGatewayUrl] = useState(storedUrl)
  const [gatewayToken, setGatewayToken] = useState(storedToken)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const [sessions, setSessions] = useState<Map<string, MonitorSession>>(new Map())
  const [runs, setRuns] = useState<Map<string, MonitorRun>>(new Map())
  const [events, setEvents] = useState<MonitorEvent[]>([])
  const [execs, setExecs] = useState<Map<string, MonitorExec>>(new Map())
  const [tokenUsage, setTokenUsage] = useState<TokenUsageEntry[]>([])
  const [tasks, setTasks] = useState<TaskItem[]>(() => loadTasks())

  const refreshTasks = useCallback(() => setTasks(loadTasks()), [])

  const clientRef = useRef<BrowserGatewayClient | null>(null)

  const applyEnvelope = useCallback((frameEvent: string, payload: unknown, seq?: number) => {
    const envelope = parseGatewayEvent(frameEvent, payload, seq)
    if (!envelope) return

    if (envelope.session?.sessionKey && envelope.session.agentId && envelope.session.channel) {
      const s = envelope.session as MonitorSession
      setSessions((prev) => {
        const next = new Map(prev)
        const existing = next.get(s.sessionKey)
        next.set(s.sessionKey, { ...(existing ?? {}), ...s } as MonitorSession)
        return next
      })
    }

    if (envelope.run?.runId) {
      const r = envelope.run
      setRuns((prev) => {
        const next = new Map(prev)
        const existing = next.get(r.runId) ?? {
          runId: r.runId,
          sessionKey: r.sessionKey ?? "unknown",
          state: "running" as const,
          startedAt: Date.now(),
        }
        next.set(r.runId, { ...existing, ...r } as MonitorRun)
        return next
      })
      // Auto-generate tasks from runs
      const title = deriveTaskTitleFromRun(envelope)
      if (title) {
        upsertAutoTaskForRun({
          runId: r.runId,
          sessionKey: r.sessionKey,
          title,
        })
        setTasks(loadTasks())
      }
      // Update auto-task status when run finishes
      if (r.state === 'final' || r.state === 'error' || r.state === 'aborted') {
        updateAutoTaskStatusByRun(r.runId, r.state)
        setTasks(loadTasks())
      }
    }

    if (envelope.event) {
      const e = envelope.event
      setEvents((prev) => {
        const next = prev.length >= MAX_EVENTS ? prev.slice(-MAX_EVENTS + 1) : prev
        return [...next, e]
      })

      // Accumulate token usage from chat final events
      if (e.kind === "chat" && e.sessionKey) {
        const usage = extractTokenUsage(e.sessionKey, payload)
        if (usage) {
          setTokenUsage((prev) => [...prev, usage])
        }
      }
    }

    if (envelope.exec) {
      const ex = envelope.exec
      setExecs((prev) => {
        const next = new Map(prev)
        next.set(ex.execId, ex)
        return next
      })
    }
  }, [])

  const connectToGateway = useCallback(
    async (url: string, token: string) => {
      if (!url) return
      if (clientRef.current) {
        clientRef.current.disconnect()
        clientRef.current = null
      }

      const client = new BrowserGatewayClient(url, token || undefined)
      clientRef.current = client

      client.onStatusChange((isConnected) => {
        setConnected(isConnected)
        setConnecting(false)
      })

      client.onEvent(({ event, payload, seq }) => {
        applyEnvelope(event, payload, seq)
      })

      setConnecting(true)
      try {
        await client.connect()
      } catch {
        setConnecting(false)
      }
    },
    [applyEnvelope],
  )

  // Connect on mount if URL is stored
  useEffect(() => {
    if (gatewayUrl) {
      void connectToGateway(gatewayUrl, gatewayToken)
    }
    return () => {
      clientRef.current?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setConnection = useCallback(
    (url: string, token: string) => {
      localStorage.setItem(GATEWAY_URL_KEY, url)
      localStorage.setItem(GATEWAY_TOKEN_KEY, token)
      setGatewayUrl(url)
      setGatewayToken(token)
      // Reset live state (tasks persist in localStorage)
      setSessions(new Map())
      setRuns(new Map())
      setEvents([])
      setExecs(new Map())
      setTokenUsage([])
      setTasks(loadTasks())
      void connectToGateway(url, token)
    },
    [connectToGateway],
  )

  const request = useCallback(async <T = unknown>(method: string, params?: unknown): Promise<T> => {
    if (!clientRef.current) throw new Error("Not connected")
    return clientRef.current.request<T>(method, params)
  }, [])

  const reconnect = useCallback(() => {
    void connectToGateway(gatewayUrl, gatewayToken)
  }, [connectToGateway, gatewayUrl, gatewayToken])

  return (
    <GatewayContext.Provider
      value={{
        gatewayUrl,
        gatewayToken,
        setConnection,
        connected,
        connecting,
        sessions,
        runs,
        events,
        execs,
        tokenUsage,
        tasks,
        refreshTasks,
        request,
        reconnect,
      }}
    >
      {children}
    </GatewayContext.Provider>
  )
}
