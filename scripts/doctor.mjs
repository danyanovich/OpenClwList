#!/usr/bin/env node
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const cwd = process.cwd()
const args = new Set(process.argv.slice(2))
const quiet = args.has('--quiet')
const modeOverride = (() => {
  const modeArg = [...args].find((a) => a.startsWith('--mode='))
  if (!modeArg) return undefined
  const value = modeArg.split('=', 2)[1]
  return value === 'remote' ? 'remote' : value === 'local' ? 'local' : undefined
})()

function log(line = '') {
  if (!quiet) console.log(line)
}

function ok(msg) {
  log(`OK   ${msg}`)
}

function warn(msg) {
  log(`WARN ${msg}`)
}

function fail(msg) {
  log(`FAIL ${msg}`)
}

function parseEnvFile(filePath) {
  const result = {}
  if (!fs.existsSync(filePath)) return result
  const text = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    let value = rawValue.trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

function mergedEnv() {
  const envFile = parseEnvFile(path.join(cwd, '.env'))
  return { ...envFile, ...process.env }
}

function parseBool(value, fallback) {
  if (value == null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function checkCommand(cmd, versionArgs = ['--version']) {
  const res = spawnSync(cmd, versionArgs, { encoding: 'utf8' })
  if (res.error || res.status !== 0) return null
  return (res.stdout || res.stderr || '').trim()
}

function compareMajorAtLeast(version, requiredMajor) {
  const major = Number(String(version).replace(/^v/, '').split('.')[0])
  return Number.isFinite(major) && major >= requiredMajor
}

function tcpCheck(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let done = false
    const finish = (ok, error) => {
      if (done) return
      done = true
      socket.destroy()
      resolve({ ok, error })
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false, 'timeout'))
    socket.once('error', (err) => finish(false, err.message))
    socket.connect(port, host)
  })
}

function parseHosts(env) {
  const defaultHostId = (env.OPS_UI_DEFAULT_HOST_ID || 'local').trim() || 'local'
  const raw = env.OPS_UI_HOSTS_JSON?.trim()
  if (!raw) {
    return [{
      id: defaultHostId,
      name: defaultHostId === 'local' ? 'Local OpenClaw' : defaultHostId,
      gatewayUrl: env.CLAWDBOT_URL || 'ws://127.0.0.1:18789',
      enabled: true,
    }]
  }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.map((h) => ({
      id: String(h.id || ''),
      name: String(h.name || h.id || ''),
      gatewayUrl: String(h.gatewayUrl || ''),
      enabled: h.enabled !== false,
    }))
  } catch {
    return null
  }
}

async function main() {
  let failures = 0
  let warnings = 0
  const env = mergedEnv()

  log('OpenClwList doctor')
  log(`Path: ${cwd}`)
  log('')

  const nodeVersion = checkCommand('node')
  if (!nodeVersion) {
    fail('Node.js not found in PATH')
    failures++
  } else {
    const good = compareMajorAtLeast(nodeVersion, 24)
    if (good) {
      ok(`Node.js ${nodeVersion}`)
    } else {
      fail(`Node.js ${nodeVersion} (requires >=24)`)
      failures++
    }
  }

  const npmVersion = checkCommand('npm')
  if (!npmVersion) {
    fail('npm not found in PATH')
    failures++
  } else {
    ok(`npm ${npmVersion}`)
  }

  if (fs.existsSync(path.join(cwd, 'package.json'))) ok('package.json found')
  else { fail('package.json not found'); failures++ }

  if (fs.existsSync(path.join(cwd, 'node_modules'))) ok('node_modules present')
  else { warn('node_modules missing (run npm ci)'); warnings++ }

  if (fs.existsSync(path.join(cwd, '.env'))) ok('.env found')
  else { warn('.env missing (copy .env.example to .env)'); warnings++ }

  const mode = modeOverride || (String(env.OPS_UI_MODE || '').trim() === 'remote' ? 'remote' : 'local')
  const host = (env.OPS_UI_HOST || env.HOST || '127.0.0.1').trim()
  const port = Number(env.OPS_UI_PORT || env.PORT || 3010)
  const authEnabled = parseBool(env.OPS_UI_AUTH_ENABLED, mode === 'remote')
  const dangerousEnabled = mode === 'local' ? true : parseBool(env.OPS_UI_REMOTE_ALLOW_DANGEROUS_ACTIONS, false)

  ok(`Mode=${mode} bind=${host}:${port}`)
  ok(`Auth=${authEnabled ? 'enabled' : 'disabled'} dangerousActions=${dangerousEnabled ? 'enabled' : 'disabled'}`)

  if (authEnabled) {
    if (env.OPS_UI_BEARER_TOKEN?.trim()) ok('OPS_UI_BEARER_TOKEN is set')
    else {
      warn('OPS_UI_BEARER_TOKEN missing while auth is enabled (bootstrap UI setup mode will be used on first run)')
      warnings++
    }
  }

  const hosts = parseHosts(env)
  if (!hosts) {
    fail('OPS_UI_HOSTS_JSON is invalid JSON')
    failures++
  } else {
    ok(`Configured OpenClaw hosts: ${hosts.length}`)
    for (const h of hosts.slice(0, 5)) {
      if (!h.gatewayUrl) {
        fail(`Host ${h.id || '(missing-id)'} has empty gatewayUrl`)
        failures++
        continue
      }
      try {
        const url = new URL(h.gatewayUrl)
        const tcpPort = Number(url.port || (url.protocol === 'wss:' ? 443 : url.protocol === 'ws:' ? 80 : 0))
        if (!tcpPort) {
          warn(`Host ${h.id} has unsupported gateway URL protocol: ${url.protocol}`)
          warnings++
          continue
        }
        const result = await tcpCheck(url.hostname, tcpPort)
        if (result.ok) ok(`Gateway reachable [${h.id}] ${url.hostname}:${tcpPort}`)
        else { warn(`Gateway unreachable [${h.id}] ${url.hostname}:${tcpPort} (${result.error})`); warnings++ }
      } catch (error) {
        fail(`Invalid gatewayUrl for host ${h.id || '(missing-id)'}: ${error instanceof Error ? error.message : String(error)}`)
        failures++
      }
    }
  }

  try {
    const portStatus = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
    if (portStatus.error) {
      warn('Could not check port status (lsof unavailable)')
      warnings++
    } else if (portStatus.status === 0 && portStatus.stdout.trim()) {
      ok(`Port ${port} is currently in use (listener detected)`)
      const curl = spawnSync('curl', ['-fsS', `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}/health`], { encoding: 'utf8' })
      if (curl.status === 0) ok(`Health endpoint responded on :${port}`)
      else warn(`Port ${port} is in use but /health did not respond as expected`)
    } else {
      ok(`Port ${port} is free (or no listener detected)`)
    }
  } catch {
    warn('Could not check port status (lsof unavailable)')
    warnings++
  }

  log('')
  if (failures > 0) {
    fail(`Doctor found ${failures} failure(s) and ${warnings} warning(s)`)
    process.exit(1)
  }
  if (warnings > 0) {
    warn(`Doctor found ${warnings} warning(s), but no blocking issues`)
  } else {
    ok('Doctor checks passed')
  }
}

main().catch((error) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
