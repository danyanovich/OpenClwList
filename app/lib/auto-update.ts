// Client-side auto-update checker

let cachedVersion: string | null = null

export async function checkForUpdate(): Promise<boolean> {
  try {
    const res = await fetch('/api/version', { cache: 'no-store' })
    if (!res.ok) return false

    const { version: newVersion } = (await res.json()) as { version: string }

    // Get current version from package.json (embedded in HTML meta tag at build time)
    const currentVersion = typeof document !== 'undefined'
      ? document.querySelector('meta[name="app-version"]')?.getAttribute('content') ?? '0.0.0'
      : '0.0.0'

    // Simple semver comparison: "0.02.0" > "0.01.0"
    const isNewer = compareVersions(newVersion, currentVersion) > 0
    if (isNewer) {
      cachedVersion = newVersion
    }
    return isNewer
  } catch (err) {
    console.warn('[auto-update] check failed:', err)
    return false
  }
}

export function getNewVersion(): string | null {
  return cachedVersion
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number)
  const bParts = b.split('.').map(Number)

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] ?? 0
    const bPart = bParts[i] ?? 0
    if (aPart > bPart) return 1
    if (aPart < bPart) return -1
  }
  return 0
}
