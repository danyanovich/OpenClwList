import { readFileSync } from 'fs'
import { resolve } from 'path'

let cachedVersion: string | null = null

export async function GET() {
  try {
    if (!cachedVersion) {
      const pkgPath = resolve(process.cwd(), 'package.json')
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string }
      cachedVersion = pkg.version ?? '0.0.0'
    }

    return Response.json({ version: cachedVersion })
  } catch (err) {
    console.error('[api/version] failed:', err)
    return Response.json({ version: '0.0.0' }, { status: 500 })
  }
}
