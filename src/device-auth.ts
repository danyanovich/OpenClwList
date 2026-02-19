import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type DeviceIdentity = {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}

type StoredIdentity = {
  version: 1
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
  createdAtMs: number
}

type DeviceAuthEntry = {
  token: string
  role: string
  scopes: string[]
  updatedAtMs: number
}

type DeviceAuthStore = {
  version: 1
  deviceId: string
  tokens: Record<string, DeviceAuthEntry>
}

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.OPENCLAW_STATE_DIR?.trim()
  if (fromEnv) return path.resolve(fromEnv)
  return path.join(os.homedir(), '.openclaw')
}

function resolveIdentityPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), 'identity', 'device.json')
}

function resolveDeviceAuthPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), 'identity', 'device-auth.json')
}

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string): Buffer {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const key = crypto.createPublicKey(publicKeyPem)
  const spki = key.export({ type: 'spki', format: 'der' }) as Buffer
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length)
  }
  return spki
}

function fingerprintPublicKey(publicKeyPem: string): string {
  const raw = derivePublicKeyRaw(publicKeyPem)
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function normalizeRole(role: string): string {
  return role.trim().toLowerCase() || 'operator'
}

function normalizeScopes(scopes?: string[]): string[] {
  if (!Array.isArray(scopes)) return []
  const set = new Set<string>()
  for (const scope of scopes) {
    if (typeof scope !== 'string') continue
    const s = scope.trim()
    if (s) set.add(s)
  }
  return [...set]
}

export function loadOrCreateDeviceIdentity(filePath = resolveIdentityPath()): DeviceIdentity {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw) as StoredIdentity
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === 'string' &&
        typeof parsed.publicKeyPem === 'string' &&
        typeof parsed.privateKeyPem === 'string'
      ) {
        const derived = fingerprintPublicKey(parsed.publicKeyPem)
        if (derived !== parsed.deviceId) {
          const fixed: StoredIdentity = { ...parsed, deviceId: derived }
          fs.writeFileSync(filePath, `${JSON.stringify(fixed, null, 2)}\n`, { mode: 0o600 })
          try {
            fs.chmodSync(filePath, 0o600)
          } catch {
            // best effort
          }
          return {
            deviceId: derived,
            publicKeyPem: parsed.publicKeyPem,
            privateKeyPem: parsed.privateKeyPem,
          }
        }

        return {
          deviceId: parsed.deviceId,
          publicKeyPem: parsed.publicKeyPem,
          privateKeyPem: parsed.privateKeyPem,
        }
      }
    }
  } catch {
    // regenerate below
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const identity: DeviceIdentity = {
    deviceId: fingerprintPublicKey(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
  }

  const stored: StoredIdentity = {
    version: 1,
    deviceId: identity.deviceId,
    publicKeyPem,
    privateKeyPem,
    createdAtMs: Date.now(),
  }
  ensureDir(filePath)
  fs.writeFileSync(filePath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 })
  try {
    fs.chmodSync(filePath, 0o600)
  } catch {
    // best effort
  }
  return identity
}

export function publicKeyRawBase64UrlFromPem(publicKeyPem: string): string {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem))
}

export function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem)
  const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), key)
  return base64UrlEncode(sig)
}

export function buildDeviceAuthPayload(params: {
  deviceId: string
  clientId: string
  clientMode: string
  role: string
  scopes: string[]
  signedAtMs: number
  token?: string | null
  nonce?: string | null
}): string {
  const version = params.nonce ? 'v2' : 'v1'
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(params.signedAtMs),
    params.token ?? '',
  ]
  if (version === 'v2') {
    base.push(params.nonce ?? '')
  }
  return base.join('|')
}

function readAuthStore(filePath: string): DeviceAuthStore | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as DeviceAuthStore
    if (parsed?.version !== 1 || typeof parsed.deviceId !== 'string' || !parsed.tokens) return null
    return parsed
  } catch {
    return null
  }
}

function writeAuthStore(filePath: string, store: DeviceAuthStore): void {
  ensureDir(filePath)
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 })
  try {
    fs.chmodSync(filePath, 0o600)
  } catch {
    // best effort
  }
}

export function loadDeviceAuthToken(params: {
  deviceId: string
  role: string
  env?: NodeJS.ProcessEnv
}): DeviceAuthEntry | null {
  const filePath = resolveDeviceAuthPath(params.env)
  const store = readAuthStore(filePath)
  if (!store || store.deviceId !== params.deviceId) return null
  const role = normalizeRole(params.role)
  const entry = store.tokens[role]
  if (!entry || typeof entry.token !== 'string') return null
  return entry
}

export function storeDeviceAuthToken(params: {
  deviceId: string
  role: string
  token: string
  scopes?: string[]
  env?: NodeJS.ProcessEnv
}): DeviceAuthEntry {
  const filePath = resolveDeviceAuthPath(params.env)
  const role = normalizeRole(params.role)
  const existing = readAuthStore(filePath)

  const store: DeviceAuthStore = {
    version: 1,
    deviceId: params.deviceId,
    tokens:
      existing && existing.deviceId === params.deviceId && existing.tokens
        ? { ...existing.tokens }
        : {},
  }

  const entry: DeviceAuthEntry = {
    token: params.token,
    role,
    scopes: normalizeScopes(params.scopes),
    updatedAtMs: Date.now(),
  }

  store.tokens[role] = entry
  writeAuthStore(filePath, store)
  return entry
}

export function clearDeviceAuthToken(params: {
  deviceId: string
  role: string
  env?: NodeJS.ProcessEnv
}): void {
  const filePath = resolveDeviceAuthPath(params.env)
  const store = readAuthStore(filePath)
  if (!store || store.deviceId !== params.deviceId) return
  const role = normalizeRole(params.role)
  if (!store.tokens[role]) return

  const next: DeviceAuthStore = {
    version: 1,
    deviceId: store.deviceId,
    tokens: { ...store.tokens },
  }
  delete next.tokens[role]
  writeAuthStore(filePath, next)
}
