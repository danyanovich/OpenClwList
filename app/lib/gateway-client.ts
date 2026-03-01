// Browser-side Gateway WebSocket client
// Replaces src/gateway-client.ts (which used ws npm package + node:crypto)

import {
  buildDeviceAuthPayload,
  clearDeviceAuthToken,
  loadDeviceAuthToken,
  loadOrCreateDeviceIdentity,
  publicKeyRawBase64Url,
  signDevicePayload,
  storeDeviceAuthToken,
  type LoadedIdentity,
} from './device-auth'

type GatewayFrame =
  | { type: 'req'; id: string; method: string; params?: unknown }
  | { type: 'res'; id: string; ok: boolean; payload?: unknown; error?: { code?: string; message?: string } }
  | { type: 'event'; event: string; payload?: unknown; seq?: number }
  | { type: 'hello-ok'; protocol?: number }

type EventHandler = (event: { event: string; payload?: unknown; seq?: number }) => void
type StatusHandler = (connected: boolean) => void

type RequestResolver = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export class BrowserGatewayClient {
  private ws: WebSocket | null = null
  private identity: LoadedIdentity | null = null
  private readonly role = 'operator'
  private readonly scopes = ['operator.admin']
  private connectNonce: string | null = null
  private connectSent = false
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private closedByUser = false
  private connected = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private requestId = 0
  private pending = new Map<string, RequestResolver>()
  private eventListeners = new Set<EventHandler>()
  private statusListeners = new Set<StatusHandler>()

  constructor(
    private url: string,
    private token?: string,
  ) {}

  isConnected(): boolean {
    return this.connected
  }

  onEvent(handler: EventHandler): () => void {
    this.eventListeners.add(handler)
    return () => this.eventListeners.delete(handler)
  }

  onStatusChange(handler: StatusHandler): () => void {
    this.statusListeners.add(handler)
    return () => this.statusListeners.delete(handler)
  }

  private notifyStatus(connected: boolean): void {
    for (const h of this.statusListeners) h(connected)
  }

  async connect(): Promise<void> {
    if (this.connected || this.ws) return
    this.closedByUser = false

    if (!this.identity) {
      this.identity = await loadOrCreateDeviceIdentity()
    }

    await new Promise<void>((resolve, reject) => {
      let resolved = false

      const ws = new WebSocket(this.url)
      this.ws = ws

      const fail = (error: Error) => {
        if (resolved) return
        resolved = true
        this.connected = false
        this.ws = null
        reject(error)
      }

      ws.onerror = () => fail(new Error('WebSocket error'))

      ws.onopen = () => {
        this.queueConnect()
      }

      ws.onmessage = (evt) => {
        let frame: GatewayFrame
        try {
          frame = JSON.parse(String(evt.data)) as GatewayFrame
        } catch {
          return
        }

        if (
          (frame as { type?: string; event?: string }).type === 'event' &&
          (frame as { event?: string }).event === 'connect.challenge'
        ) {
          const payload = (frame as { payload?: { nonce?: unknown } }).payload
          const nonce =
            payload && typeof payload.nonce === 'string' ? payload.nonce : null
          if (nonce) {
            this.connectNonce = nonce
            void this.sendConnect()
          }
          return
        }

        if ((frame as { type?: string }).type === 'hello-ok') {
          this.onHelloOk(frame as { auth?: { deviceToken?: string; role?: string; scopes?: string[] } })
          this.connected = true
          this.notifyStatus(true)
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
            this.notifyStatus(true)
            resolved = true
            resolve()
          }
          return
        }

        if ((frame as { type?: string }).type === 'event') {
          const evt2 = frame as Extract<GatewayFrame, { type: 'event' }>
          for (const h of this.eventListeners) {
            h({ event: evt2.event, payload: evt2.payload, seq: evt2.seq })
          }
        }
      }

      ws.onclose = (ev) => {
        const wasConnected = this.connected
        this.connected = false
        this.ws = null
        if (wasConnected) this.notifyStatus(false)
        // Clear cached device token on mismatch
        if (ev.code === 1008 && this.identity &&
          typeof ev.reason === 'string' && ev.reason.toLowerCase().includes('device token mismatch')) {
          clearDeviceAuthToken(this.identity.deviceId, this.role)
        }
        if (!resolved) {
          fail(new Error(`Gateway closed before handshake (code=${ev.code})`))
          return
        }
        if (!this.closedByUser) {
          this.scheduleReconnect()
        }
      }

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
    if (this.connected) {
      this.connected = false
      this.notifyStatus(false)
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectAttempts += 1
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(this.reconnectAttempts, 5)))
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch(() => {
        this.scheduleReconnect()
      })
    }, delay)
  }

  private async sendConnect(): Promise<void> {
    if (this.connectSent || !this.identity || !this.ws) return
    this.connectSent = true
    if (this.connectTimer) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }

    const identity = this.identity
    const storedToken = loadDeviceAuthToken(identity.deviceId, this.role)
    const authToken = this.token ?? storedToken ?? undefined
    const signedAtMs = Date.now()
    const nonce = this.connectNonce ?? undefined

    const payload = buildDeviceAuthPayload({
      deviceId: identity.deviceId,
      clientId: 'browser-ui',
      clientMode: 'browser',
      role: this.role,
      scopes: this.scopes,
      signedAtMs,
      token: authToken ?? null,
      nonce,
    })
    const signature = await signDevicePayload(identity.privateKey, payload)

    const frame = {
      type: 'req' as const,
      id: `connect-${Date.now()}`,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: { id: 'browser-ui', version: '0.1.0', platform: 'browser', mode: 'browser' },
        caps: [],
        auth: authToken ? { token: authToken } : undefined,
        role: this.role,
        scopes: this.scopes,
        device: {
          id: identity.deviceId,
          publicKey: publicKeyRawBase64Url(identity.publicKeyRaw),
          signature,
          signedAt: signedAtMs,
          nonce,
        },
        locale: navigator.language || 'en-US',
        userAgent: 'openclaw-browser-ui/0.1.0',
      },
    }
    this.ws?.send(JSON.stringify(frame))
  }

  private queueConnect(): void {
    this.connectNonce = null
    this.connectSent = false
    if (this.connectTimer) clearTimeout(this.connectTimer)
    this.connectTimer = setTimeout(() => {
      void this.sendConnect()
    }, 750)
  }

  private onHelloOk(payload: {
    auth?: { deviceToken?: string; role?: string; scopes?: string[] }
  }): void {
    const authInfo = payload.auth
    if (!authInfo?.deviceToken || !this.identity) return
    storeDeviceAuthToken(
      this.identity.deviceId,
      authInfo.role ?? this.role,
      authInfo.deviceToken,
      authInfo.scopes ?? [],
    )
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gateway is not connected')
    }
    const id = `req-${++this.requestId}`
    const frame = { type: 'req' as const, id, method, params }
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Gateway request timeout: ${method}`))
      }, 30000)
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      })
      this.ws!.send(JSON.stringify(frame))
    })
  }
}

