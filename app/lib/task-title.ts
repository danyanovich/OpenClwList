// Derive a task title from a gateway run envelope
// Ported from the title-extraction logic in src/server.ts

import type { ParsedEnvelope } from './parser'

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function deriveTaskTitleFromRun(envelope: ParsedEnvelope): string | null {
  if (!envelope.run?.runId) return null

  // Only create tasks for user-prompt chat events (state = 'delta' or 'final', stream = 'chat')
  const event = envelope.event
  if (!event || event.kind !== 'chat') return null

  const payload = event.payload as Record<string, unknown> | null
  if (!payload) return null

  const state = trim(payload.state)
  if (state !== 'delta' && state !== 'final') return null

  // Look for user message content
  const message = payload.message as Record<string, unknown> | undefined
  if (!message) return null

  const role = trim(message.role)
  if (role !== 'user') return null

  const content = message.content
  if (typeof content === 'string') {
    const text = content.trim().slice(0, 120)
    return text || null
  }
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
        const text = trim((block as { text?: unknown }).text).slice(0, 120)
        if (text) return text
      }
    }
  }
  return null
}
