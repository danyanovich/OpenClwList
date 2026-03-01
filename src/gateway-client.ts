import WebSocket from 'ws'
import type { Diagnostics, GatewayFrame } from './types.js'

type EventHandler = (event: { event: string; payload?: unknown; seq?: number }) => void

type RequestResolver = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

export class GatewayClient {
  private ws: WebSocket | null = null
  private readonly role = 'operator'
  private readonly scopes = ['operator.admin']
  private connectNonce: string | null = null
  private connectSent = false
  private connectTimer: NodeJS.Timeout | null = null
  private closedByUser = false
  private connected = false
  private connecting = false
  private reconnectAttempts = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private requestId = 0
  private pending = new Map<string, RequestResolver>()
  private listeners = new Set<EventHandler>()
  private diagnostics: Diagnostics

  constructor(
    private readonly url: string,
    private readonly token?: string,
  ) {
    this.diagnostics = {
      connected: false,
      reconnectAttempts: 0,
      parserErrors: 0,
      streamGaps: 0,
      droppedNoisyEvents: 0,
      queuedEvents: 0,
    }
  }

  getDiagnostics(): Diagnostics {
    return { ...this.diagnostics }
  }

  isConnected(): boolean {
    return this.connected
  }

  isConnecting(): boolean {
    return this.connecting
  }

  incrementParserErrors(): void {
    this.diagnostics.parserErrors += 1
  }

  incrementStreamGaps(): void {
    this.diagnostics.streamGaps += 1
  }

  setQueuedEvents(value: number): void {
    this.diagnostics.queuedEvents = value
  }

  addDroppedNoisy(count = 1): void {
    this.diagnostics.droppedNoisyEvents += count
  }

  onEvent(handler: EventHandler): () => void {
    this.listeners.add(handler)
    return () => this.listeners.delete(handler)
  }

  async connect(): Promise<void> {
    if (this.connected || this.connecting) return
    this.closedByUser = false
    this.connecting = true
    await new Promise<void>((resolve, reject) => {
      let resolved = false
      const ws = new WebSocket(this.url)
      this.ws = ws

      const fail = (error: Error) => {
        if (resolved) return
        resolved = true
        this.connecting = false
        this.connected = false
        this.diagnostics.connected = false
        this.diagnostics.lastError = error.message
        this.diagnostics.lastDisconnectAt = Date.now()
        reject(error)
      }

      ws.once('error', (err) => fail(err instanceof Error ? err : new Error(String(err))))

      ws.once('open', () => {
        this.queueConnect()
      })

      ws.on('message', (raw) => {
        let frame: GatewayFrame
        try {
          frame = JSON.parse(String(raw)) as GatewayFrame
        } catch {
          return
        }

        if ((frame as { type?: string; event?: string }).type === 'event' && (frame as { event?: string }).event === 'connect.challenge') {
          const payload = (frame as { payload?: { nonce?: unknown } }).payload
          const nonce = payload && typeof payload.nonce === 'string' ? payload.nonce : null
          if (nonce) {
            this.connectNonce = nonce
            this.sendConnect()
          }
          return
        }

        if ((frame as { type?: string }).type === 'hello-ok') {
          this.onHelloOk(frame as { auth?: { deviceToken?: string; role?: string; scopes?: string[] } })
          this.connected = true
          this.connecting = false
          this.reconnectAttempts = 0
          this.diagnostics.connected = true
          this.diagnostics.lastConnectAt = Date.now()
          if (!resolved) {
            resolved = true
            resolve()
          }
          return
        }

        if ((frame as { type?: string }).type === 'res') {
          const res = frame as Extract<GatewayFrame, { type: 'res' }>
          const pending = this.pending.get(res.id)
          if (pending) {
            this.pending.delete(res.id)
            clearTimeout(pending.timeout)
            if (res.ok) pending.resolve(res.payload)
            else pending.reject(new Error(res.error?.message || 'Request failed'))
          }

          const payload = res.payload as { type?: string }
          if (res.ok && payload?.type === 'hello-ok' && !resolved) {
            this.onHelloOk(payload as { auth?: { deviceToken?: string; role?: string; scopes?: string[] } })
            this.connected = true
            this.connecting = false
            this.reconnectAttempts = 0
            this.diagnostics.connected = true
            this.diagnostics.lastConnectAt = Date.now()
            resolved = true
            resolve()
          }
          return
        }

        if ((frame as { type?: string }).type === 'event') {
          const evt = frame as Extract<GatewayFrame, { type: 'event' }>
          for (const listener of this.listeners) {
            listener({ event: evt.event, payload: evt.payload, seq: evt.seq })
          }
        }
      })

      ws.once('close', (code, reason) => {
        this.connected = false
        this.connecting = false
        this.diagnostics.connected = false
        this.diagnostics.lastDisconnectAt = Date.now()
        const reasonText = typeof reason === 'string' ? reason : reason.toString()
        const closeMessage = `Gateway closed before handshake completed (code=${code} reason=${reasonText || 'n/a'})`
        if (!resolved) {
          fail(new Error(closeMessage))
          return
        }
        if (!this.closedByUser) {
          this.scheduleReconnect()
        }
      })
      ws.on('close', (code, reason) => {
        const reasonText = typeof reason === 'string' ? reason : reason.toString()
        this.diagnostics.lastError = `ws close code=${code} reason=${reasonText || 'n/a'}`
      })

      setTimeout(() => {
        if (!resolved && !this.connected) {
          fail(new Error('Gateway connect timeout'))
        }
      }, 10000)
    })
  }

  disconnect(): void {
    this.closedByUser = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close(1000)
      this.ws = null
    }
    this.connected = false
    this.connecting = false
    this.diagnostics.connected = false
    this.diagnostics.lastDisconnectAt = Date.now()
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectAttempts += 1
    this.diagnostics.reconnectAttempts = this.reconnectAttempts
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(this.reconnectAttempts, 5)))
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch((err) => {
        this.diagnostics.lastError = err instanceof Error ? err.message : String(err)
        this.scheduleReconnect()
      })
    }, delay)
  }

  private sendConnect(): void {
    if (this.connectSent) return
    this.connectSent = true
    if (this.connectTimer) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }

    const authToken = this.token ?? undefined

    const frame = {
      type: 'req',
      id: `connect-${Date.now()}`,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'cli',
          version: '0.1.0',
          platform: process.platform,
          mode: 'cli',
        },
        caps: [],
        auth: authToken ? { token: authToken } : undefined,
        role: this.role,
        scopes: this.scopes,
        locale: 'en-US',
        userAgent: 'ops-ui/0.1.0',
      },
    }
    this.ws?.send(JSON.stringify(frame))
  }

  private queueConnect(): void {
    this.connectNonce = null
    this.connectSent = false
    if (this.connectTimer) {
      clearTimeout(this.connectTimer)
    }
    this.connectTimer = setTimeout(() => {
      this.sendConnect()
    }, 750)
  }

  private onHelloOk(payload: {
    auth?: { deviceToken?: string; role?: string; scopes?: string[] }
  }): void {
    // Basic connection doesn't necessarily need to persist anything unless we need it
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gateway is not connected')
    }
    const id = `req-${++this.requestId}`
    const frame = { type: 'req' as const, id, method, params }
    return await new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Gateway request timeout: ${method}`))
      }, 30000)

      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timeout })
      this.ws?.send(JSON.stringify(frame))
    })
  }
}
