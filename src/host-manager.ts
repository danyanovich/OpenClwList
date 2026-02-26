import { GatewayClient } from './gateway-client.js'
import type { Diagnostics, HostConfig, HostSummary } from './types.js'

type ActiveEvent = { event: string; payload?: unknown; seq?: number }
type ActiveEventHandler = (evt: ActiveEvent) => void

export class HostManager {
  private readonly hosts = new Map<string, HostConfig>()
  private readonly clients = new Map<string, GatewayClient>()
  private readonly listeners = new Set<ActiveEventHandler>()
  private activeHostId: string

  constructor(hosts: HostConfig[], defaultHostId: string) {
    if (hosts.length === 0) throw new Error('HostManager requires at least one host')
    this.activeHostId = defaultHostId
    for (const host of hosts) {
      this.hosts.set(host.id, host)
      this.clients.set(host.id, this.createClient(host))
    }
    if (!this.clients.has(defaultHostId)) {
      throw new Error(`Unknown default host: ${defaultHostId}`)
    }
  }

  getActiveHostId(): string {
    return this.activeHostId
  }

  getActiveHost(): HostConfig {
    return this.getHost(this.activeHostId)
  }

  getHost(id: string): HostConfig {
    const host = this.hosts.get(id)
    if (!host) throw new Error(`Unknown host: ${id}`)
    return host
  }

  getActiveClient(): GatewayClient {
    return this.getClient(this.activeHostId)
  }

  getClient(id: string): GatewayClient {
    const client = this.clients.get(id)
    if (!client) throw new Error(`Unknown host: ${id}`)
    return client
  }

  listHosts(): HostSummary[] {
    return Array.from(this.hosts.values()).map((host) => {
      const client = this.getClient(host.id)
      const d = client.getDiagnostics()
      return {
        id: host.id,
        name: host.name,
        enabled: host.enabled,
        gatewayUrl: host.gatewayUrl,
        connected: d.connected,
        connecting: client.isConnecting(),
        lastError: d.lastError,
        lastConnectAt: d.lastConnectAt,
        lastDisconnectAt: d.lastDisconnectAt,
      }
    })
  }

  getActiveDiagnostics(): Diagnostics {
    return this.getActiveClient().getDiagnostics()
  }

  selectHost(id: string): void {
    const host = this.getHost(id)
    if (!host.enabled) throw new Error(`Host is disabled: ${id}`)
    this.activeHostId = id
  }

  async connect(id = this.activeHostId): Promise<void> {
    const host = this.getHost(id)
    if (!host.enabled) throw new Error(`Host is disabled: ${id}`)
    await this.getClient(id).connect()
  }

  disconnect(id = this.activeHostId): void {
    this.getClient(id).disconnect()
  }

  updateHostConnection(
    id: string,
    updates: { gatewayUrl?: string; gatewayToken?: string; gatewayTokenSource?: string },
  ): HostConfig {
    const current = this.getHost(id)
    const next: HostConfig = {
      ...current,
      gatewayUrl: updates.gatewayUrl ?? current.gatewayUrl,
      gatewayToken: updates.gatewayToken ?? current.gatewayToken,
      gatewayTokenSource: updates.gatewayTokenSource ?? current.gatewayTokenSource,
    }
    const prevClient = this.getClient(id)
    prevClient.disconnect()
    const nextClient = this.createClient(next)
    this.hosts.set(id, next)
    this.clients.set(id, nextClient)
    return next
  }

  onActiveEvent(handler: ActiveEventHandler): () => void {
    this.listeners.add(handler)
    return () => this.listeners.delete(handler)
  }

  private createClient(host: HostConfig): GatewayClient {
    const client = new GatewayClient(host.gatewayUrl, host.gatewayToken)
    client.onEvent((evt) => {
      if (host.id !== this.activeHostId) return
      for (const listener of this.listeners) listener(evt)
    })
    return client
  }
}
