// Browser-side device identity using Web Crypto (Ed25519)
// Replaces src/device-auth.ts (which used node:crypto)

const IDENTITY_KEY = 'openclaw_device_identity'
const AUTH_TOKEN_KEY = 'openclaw_device_auth'

export type DeviceIdentity = {
  deviceId: string
  publicKeyJwk: JsonWebKey
  privateKeyJwk: JsonWebKey
}

type DeviceAuthEntry = { token: string; role: string; scopes: string[] }
type DeviceAuthStore = { deviceId: string; tokens: Record<string, DeviceAuthEntry> }

// Loaded identity with the CryptoKey objects and raw public key bytes
export type LoadedIdentity = DeviceIdentity & {
  privateKey: CryptoKey
  publicKeyRaw: ArrayBuffer
}

function base64UrlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '')
}

async function fingerprintPublicKey(rawKey: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', rawKey)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function loadOrCreateDeviceIdentity(): Promise<LoadedIdentity> {
  const stored = localStorage.getItem(IDENTITY_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as DeviceIdentity
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        parsed.publicKeyJwk,
        { name: 'Ed25519' },
        true,
        ['verify'],
      )
      const privateKey = await crypto.subtle.importKey(
        'jwk',
        parsed.privateKeyJwk,
        { name: 'Ed25519' },
        false,
        ['sign'],
      )
      const publicKeyRaw = await crypto.subtle.exportKey('raw', publicKey)
      return { ...parsed, privateKey, publicKeyRaw }
    } catch {
      // fall through to regenerate
    }
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  )
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey)
  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey)
  const deviceId = await fingerprintPublicKey(publicKeyRaw)

  const identity: DeviceIdentity = { deviceId, publicKeyJwk, privateKeyJwk }
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))

  return { ...identity, privateKey: keyPair.privateKey, publicKeyRaw }
}

export function publicKeyRawBase64Url(raw: ArrayBuffer): string {
  return base64UrlEncode(raw)
}

export async function signDevicePayload(
  privateKey: CryptoKey,
  payload: string,
): Promise<string> {
  const sig = await crypto.subtle.sign(
    'Ed25519',
    privateKey,
    new TextEncoder().encode(payload),
  )
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
  if (version === 'v2') base.push(params.nonce ?? '')
  return base.join('|')
}

export function loadDeviceAuthToken(deviceId: string, role: string): string | null {
  try {
    const raw = localStorage.getItem(AUTH_TOKEN_KEY)
    if (!raw) return null
    const store = JSON.parse(raw) as DeviceAuthStore
    if (store.deviceId !== deviceId) return null
    return store.tokens[role]?.token ?? null
  } catch {
    return null
  }
}

export function storeDeviceAuthToken(
  deviceId: string,
  role: string,
  token: string,
  scopes: string[],
): void {
  try {
    const raw = localStorage.getItem(AUTH_TOKEN_KEY)
    let store: DeviceAuthStore = { deviceId, tokens: {} }
    if (raw) {
      const parsed = JSON.parse(raw) as DeviceAuthStore
      if (parsed.deviceId === deviceId) store = parsed
    }
    store.tokens[role] = { token, role, scopes }
    localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify(store))
  } catch {
    // best effort
  }
}

export function clearDeviceAuthToken(deviceId: string, role: string): void {
  try {
    const raw = localStorage.getItem(AUTH_TOKEN_KEY)
    if (!raw) return
    const store = JSON.parse(raw) as DeviceAuthStore
    if (store.deviceId !== deviceId || !store.tokens[role]) return
    delete store.tokens[role]
    localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify(store))
  } catch {
    // best effort
  }
}
