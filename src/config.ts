import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import JSON5 from 'json5'
import type { HostConfig, OpsMode } from './types.js'

type Env = NodeJS.ProcessEnv

export type OpsConfig = {
  mode: OpsMode
  host: string
  port: number
  trustProxy: boolean
  authEnabled: boolean
  bearerToken?: string
  dangerousActionsEnabled: boolean
  defaultHostId: string
  hosts: HostConfig[]
}

type GatewayTokenDetection = { token?: string; source: string }

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw === '') return fallback
  const normalized = raw.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function detectGatewayToken(env: Env): GatewayTokenDetection {
  const envToken = env.CLAWDBOT_API_TOKEN?.trim()
  if (envToken) {
    return { token: envToken, source: 'env:CLAWDBOT_API_TOKEN' }
  }

  const configPath = env.OPENCLAW_CONFIG_PATH?.trim() || path.join(os.homedir(), '.openclaw', 'openclaw.json')
  if (!fs.existsSync(configPath)) {
    return { source: `not found: ${configPath}` }
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8')
    const parsed = JSON5.parse(raw) as { gateway?: { auth?: { token?: string } } }
    const token = parsed?.gateway?.auth?.token?.trim()
    if (token) return { token, source: `config:${configPath}` }
    return { source: `token missing in ${configPath}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { source: `parse error in ${configPath}: ${message}` }
  }
}

function resolveHosts(env: Env, defaultHostId: string): HostConfig[] {
  const detected = detectGatewayToken(env)
  const applyToken = (host: HostConfig): HostConfig => {
    const tokenFromNamedEnv = host.gatewayTokenEnv ? env[host.gatewayTokenEnv]?.trim() : undefined
    const fallbackEnvToken = env.CLAWDBOT_API_TOKEN?.trim()
    const gatewayToken = host.gatewayToken?.trim() || tokenFromNamedEnv || fallbackEnvToken || detected.token
    const gatewayTokenSource =
      host.gatewayToken?.trim()
        ? `hosts_json:${host.id}:gatewayToken`
        : tokenFromNamedEnv
          ? `env:${host.gatewayTokenEnv}`
          : fallbackEnvToken
            ? 'env:CLAWDBOT_API_TOKEN'
            : detected.source
    return { ...host, gatewayToken, gatewayTokenSource }
  }

  const rawHosts = env.OPS_UI_HOSTS_JSON?.trim()
  if (!rawHosts) {
    const host = applyToken({
      id: defaultHostId,
      name: defaultHostId === 'local' ? 'Local OpenClaw' : defaultHostId,
      gatewayUrl: env.CLAWDBOT_URL || 'ws://127.0.0.1:18789',
      enabled: true,
      gatewayTokenEnv: 'CLAWDBOT_API_TOKEN',
    })
    return [host]
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawHosts)
  } catch (error) {
    throw new Error(`OPS_UI_HOSTS_JSON is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('OPS_UI_HOSTS_JSON must be a non-empty array')
  }

  const seen = new Set<string>()
  const hosts: HostConfig[] = parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`OPS_UI_HOSTS_JSON[${index}] must be an object`)
    }
    const obj = entry as Record<string, unknown>
    const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : ''
    const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : id
    const gatewayUrl = typeof obj.gatewayUrl === 'string' && obj.gatewayUrl.trim() ? obj.gatewayUrl.trim() : ''
    const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : true
    const gatewayTokenEnv = typeof obj.gatewayTokenEnv === 'string' && obj.gatewayTokenEnv.trim() ? obj.gatewayTokenEnv.trim() : undefined
    const gatewayToken = typeof obj.gatewayToken === 'string' && obj.gatewayToken.trim() ? obj.gatewayToken.trim() : undefined
    if (!id) throw new Error(`OPS_UI_HOSTS_JSON[${index}].id is required`)
    if (seen.has(id)) throw new Error(`OPS_UI_HOSTS_JSON contains duplicate host id: ${id}`)
    if (!gatewayUrl) throw new Error(`OPS_UI_HOSTS_JSON[${index}].gatewayUrl is required`)
    seen.add(id)
    return applyToken({ id, name, gatewayUrl, enabled, gatewayTokenEnv, gatewayToken })
  })

  return hosts
}

export function loadConfig(env: Env = process.env): OpsConfig {
  const mode = (env.OPS_UI_MODE?.trim() === 'remote' ? 'remote' : 'local') as OpsMode
  const host = (env.OPS_UI_HOST || env.HOST || '127.0.0.1').trim()
  const port = Number(env.OPS_UI_PORT || env.PORT || 3010)
  const trustProxy = parseBool(env.OPS_UI_TRUST_PROXY, false)
  const authEnabled = parseBool(env.OPS_UI_AUTH_ENABLED, mode === 'remote')
  const bearerToken = env.OPS_UI_BEARER_TOKEN?.trim() || undefined
  const defaultHostId = (env.OPS_UI_DEFAULT_HOST_ID || 'local').trim() || 'local'
  const remoteAllowDangerous = parseBool(env.OPS_UI_REMOTE_ALLOW_DANGEROUS_ACTIONS, false)
  const dangerousActionsEnabled = mode === 'local' ? true : remoteAllowDangerous
  const hosts = resolveHosts(env, defaultHostId)
  if (!hosts.some((h) => h.id === defaultHostId)) {
    throw new Error(`OPS_UI_DEFAULT_HOST_ID "${defaultHostId}" not found in configured hosts`)
  }
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid port: ${env.OPS_UI_PORT || env.PORT}`)
  }

  // Check for runtime settings mode override
  let dynamicMode = mode
  let dynamicAuthEnabled = authEnabled
  let dynamicDangerous = dangerousActionsEnabled

  try {
    const settingsPath = path.resolve(process.cwd(), 'data', 'settings.json')
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      if (settings.uiMode === 'remote') {
        dynamicMode = 'remote'
        dynamicAuthEnabled = true // Enforce auth in remote mode
        dynamicDangerous = remoteAllowDangerous
      } else if (settings.uiMode === 'local') {
        dynamicMode = 'local'
        dynamicAuthEnabled = false // Relax auth in local mode
        dynamicDangerous = true
      }
    }
  } catch (err) {
    console.warn('[ops-ui] failed to read runtime mode from settings:', err instanceof Error ? err.message : String(err))
  }

  return {
    mode: dynamicMode,
    host,
    port,
    trustProxy,
    authEnabled: dynamicAuthEnabled,
    bearerToken,
    dangerousActionsEnabled: dynamicDangerous,
    defaultHostId,
    hosts,
  }
}
