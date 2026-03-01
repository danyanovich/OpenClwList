import type { NextFunction, Request, Response } from 'express'
import type { AgentCapabilities, OpsMode, RequestPolicyContext } from './types.js'

type SecurityConfig = {
  mode: OpsMode
  authEnabled: boolean
  bearerToken?: string
  dangerousActionsEnabled: boolean
  defaultHostId: string
  multiHost: boolean
}

function unauthorized(res: Response): void {
  res.status(401).json({ ok: false, error: 'Unauthorized' })
}

function forbidden(res: Response): void {
  res.status(403).json({ ok: false, error: 'Forbidden by policy' })
}

export function readBearerFromRequest(req: Request): string | undefined {
  const header = req.header('authorization')
  if (header) {
    const [scheme, token] = header.split(/\s+/, 2)
    if (scheme?.toLowerCase() === 'bearer' && token) return token.trim()
  }
  const queryToken = typeof req.query.access_token === 'string' ? req.query.access_token.trim() : ''
  if (queryToken) return queryToken
  const cookieHeader = req.header('cookie')
  if (cookieHeader) {
    const parts = cookieHeader.split(';').map((p) => p.trim())
    const tokenPart = parts.find((p) => p.startsWith('ops_ui_token='))
    if (tokenPart) return decodeURIComponent(tokenPart.slice('ops_ui_token='.length))
  }
  return undefined
}

export function createAuthMiddleware(config: Pick<SecurityConfig, 'authEnabled' | 'bearerToken'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.authEnabled) {
      next()
      return
    }
    const token = readBearerFromRequest(req)
    if (!token || token !== config.bearerToken) {
      unauthorized(res)
      return
    }
    next()
  }
}

export function createDangerousActionsMiddleware(config: Pick<SecurityConfig, 'dangerousActionsEnabled'>) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!config.dangerousActionsEnabled) {
      forbidden(res)
      return
    }
    next()
  }
}

export function buildCapabilities(config: SecurityConfig): AgentCapabilities {
  return {
    ok: true,
    mode: config.mode,
    authEnabled: config.authEnabled,
    dangerousActionsEnabled: config.dangerousActionsEnabled,
    multiHost: config.multiHost,
    defaultHostId: config.defaultHostId,
  }
}

export function buildPolicyContext(config: Pick<SecurityConfig, 'mode' | 'authEnabled' | 'dangerousActionsEnabled'>): RequestPolicyContext {
  return {
    mode: config.mode,
    authEnabled: config.authEnabled,
    dangerousActionsEnabled: config.dangerousActionsEnabled,
  }
}
