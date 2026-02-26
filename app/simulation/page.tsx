"use client"

import React, { useEffect, useState } from 'react'
import { Visualization } from '../components/Visualization'
import { Bot, Activity, ArrowLeft } from 'lucide-react'
import { useLanguage } from '../i18n/context'

type SessionLite = { sessionKey: string; agentId: string; status: string; lastActivityAt: number }

type AgentMeta = { id: string; name?: string; role?: string }

type RecentActivity = { ts: number; text: string; sessionKey?: string; kind?: string; toolName?: string }

export default function SimulationPage() {
    const { t } = useLanguage()

    const [sessions, setSessions] = useState<SessionLite[]>([])
    const [agentsById, setAgentsById] = useState<Record<string, AgentMeta>>({})
    const [activities, setActivities] = useState<RecentActivity[]>([])
    const [logicLoad, setLogicLoad] = useState<number | undefined>(undefined)

    useEffect(() => {
        let cancelled = false

        const loadInitial = async () => {
            try {
                const [sessionsRes, agentsRes, diagRes, runsRes] = await Promise.all([
                    fetch('/api/monitor/sessions'),
                    fetch('/api/agents'),
                    fetch('/api/monitor/diagnostics'),
                    fetch('/api/monitor/runs'),
                ])

                if (cancelled) return

                const sessionsJson = await sessionsRes.json()
                if (Array.isArray(sessionsJson.sessions)) {
                    setSessions(
                        sessionsJson.sessions.map((s: any) => ({
                            sessionKey: s.sessionKey || s.session_key,
                            agentId: s.agentId || s.agent_id,
                            status: s.status,
                            lastActivityAt: s.lastActivityAt || s.last_activity_at,
                        })),
                    )
                }

                const agentsJson = await agentsRes.json()
                if (agentsJson.ok && Array.isArray(agentsJson.agents)) {
                    const map: Record<string, AgentMeta> = {}
                    for (const a of agentsJson.agents) {
                        if (!a || typeof a.id !== 'string') continue
                        map[a.id] = { id: a.id, name: a.name, role: a.role }
                    }
                    setAgentsById(map)
                }

                const diagJson = await diagRes.json()
                if (Array.isArray(diagJson.recentEvents)) {
                    const acts: RecentActivity[] = diagJson.recentEvents
                        .slice(0, 20)
                        .map((e: any) => {
                            const ts = typeof e.ts === 'number' ? e.ts : Date.now()
                            const date = new Date(ts)
                            const hh = String(date.getHours()).padStart(2, '0')
                            const mm = String(date.getMinutes()).padStart(2, '0')
                            const base = `[${hh}:${mm}]`
                            const sessionKey = e.sessionKey || e.session_key || ''
                            const kind = e.kind || 'event'
                            const tool = e.toolName || e.tool_name
                            let label = kind
                            if (tool) label += `:${tool}`
                            const text = `${base} ${sessionKey} · ${label}`
                            return { ts, text, sessionKey, kind, toolName: tool }
                        })
                    setActivities(acts)
                }

                const runsJson = await runsRes.json()
                if (Array.isArray(runsJson.runs)) {
                    const running = runsJson.runs.filter((r: any) => r.state === 'running')
                    const load = Math.max(0, Math.min(100, running.length * 10))
                    setLogicLoad(load)
                }
            } catch (err) {
                console.error('[simulation] initial load error', err)
            }
        }

        loadInitial()

        // SSE for real-time updates
        const es = new EventSource('/api/monitor/events')
        es.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data)
                if (data.type === 'monitor_update' || data.type === 'monitor_refresh') {
                    // Trigger a partial refresh on any relevant event
                    loadInitial()
                }
            } catch (err) {
                console.error('[simulation] sse error', err)
            }
        }

        const fallbackInterval = setInterval(loadInitial, 10000)

        return () => {
            cancelled = true
            es.close()
            clearInterval(fallbackInterval)
        }
    }, [])

    const activeAgents = Object.values(
        sessions.reduce<Record<string, { id: string; name: string; status: 'idle' | 'active' | 'thinking' }>>((acc, s) => {
            if (!s.agentId) return acc
            const existing = acc[s.agentId]
            if (existing && existing.id === s.agentId && existing.status === 'thinking') {
                return acc
            }
            const meta = agentsById[s.agentId]
            const name = meta?.name || s.agentId
            const visStatus: 'idle' | 'active' | 'thinking' = s.status === 'thinking' ? 'thinking' : s.status === 'active' ? 'active' : 'idle'
            acc[s.agentId] = { id: s.agentId, name, status: visStatus }
            return acc
        }, {}),
    )

    // Map recent activities to stations per agent with better heuristics
    type Station = 'chat' | 'tasks' | 'tools' | 'browser' | 'db' | 'cron' | 'system'
    const agentStations: { agentId: string; station: Station; lastLabel?: string }[] = (() => {
        if (sessions.length === 0 || activities.length === 0) return []

        const sessionAgentMap = sessions.reduce<Record<string, string>>((acc, s) => {
            if (s.sessionKey && s.agentId) acc[s.sessionKey] = s.agentId
            return acc
        }, {})

        const stationByAgent = new Map<string, { station: Station; text: string }>()

        // Activities are already slice(0, 20) and likely sorted descending by TS
        // We want the LATEST activity for each agent
        for (const a of [...activities].reverse()) {
            const sk = a.sessionKey || ''
            const agentId = sessionAgentMap[sk]
            if (!agentId) continue

            const kind = (a.kind || '').toLowerCase()
            const tool = (a.toolName || '').toLowerCase()

            let station: Station = 'system'
            let label = ''

            if (kind === 'chat') {
                station = 'chat'
                label = 'Replying to user'
            } else if (kind === 'tool' || tool) {
                label = `Using ${a.toolName}`
                if (tool.includes('browser') || tool.includes('page') || tool.includes('click')) station = 'browser'
                else if (tool.startsWith('cron') || tool.includes('schedule')) station = 'cron'
                else if (tool.includes('db') || tool.includes('sqlite') || tool.includes('query')) station = 'db'
                else if (tool.includes('task') || tool.includes('run')) station = 'tasks'
                else station = 'tools'
            } else if (kind.includes('task')) {
                station = 'tasks'
                label = 'Managing tasks'
            }

            if (station) {
                stationByAgent.set(agentId, { station, text: label || a.text })
            }
        }

        return Array.from(stationByAgent.entries()).map(([agentId, { station, text }]) => ({
            agentId,
            station,
            lastLabel: text
        }))
    })()

    return (
        <div className="min-h-screen bg-[#0d1017] text-gray-200 p-6 flex flex-col gap-6">
            <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 border-b border-white/5 pb-6">
                <div className="flex items-center gap-4">
                    <a href="/" className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </a>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            <Activity className="w-5 h-5 text-blue-500" />
                            Agent Simulation Hub
                        </h1>
                        <p className="text-xs text-gray-500">Real-time tycoon-style agent monitor</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 mt-4 md:mt-0">
                    <div className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-500 rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse">
                        Live Gateway Stream
                    </div>
                </div>
            </header>

            <main className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Sidebar / Stats */}
                <div className="lg:col-span-1 flex flex-col gap-4">
                    <div className="bg-panel border border-rim p-4 rounded-2xl">
                        <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                            <Bot className="w-4 h-4" /> Active Agents
                        </h2>
                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                            {activeAgents.length === 0 && (
                                <div className="text-[11px] text-mute">No recent sessions from agents yet.</div>
                            )}
                            {activeAgents.map(agent => (
                                <div key={agent.id} className="flex items-center justify-between p-2 bg-well rounded-xl border border-rim">
                                    <span className="text-xs truncate max-w-[140px]">{agent.name}</span>
                                    <span
                                        className={
                                            'text-[10px] px-2 py-0.5 rounded-full ' +
                                            (agent.status === 'thinking'
                                                ? 'bg-blue-500/20 text-blue-400'
                                                : agent.status === 'active'
                                                    ? 'bg-emerald-500/20 text-emerald-400'
                                                    : 'bg-gray-500/20 text-gray-300')
                                        }
                                    >
                                        {agent.status === 'thinking'
                                            ? 'Thinking'
                                            : agent.status === 'active'
                                                ? 'Active'
                                                : 'Idle'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-panel border border-rim p-4 rounded-2xl flex-1 min-h-[200px]">
                        <h2 className="text-sm font-bold mb-3">Recent Activities</h2>
                        <div className="text-[10px] space-y-1.5 font-mono text-gray-500 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                            {activities.length === 0 && <div className="text-[11px] text-mute">Waiting for gateway traffic…</div>}
                            {activities.map((a, idx) => (
                                <div key={idx} className={idx === 0 ? 'text-blue-400' : ''}>
                                    {a.text}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main Simulation View */}
                <div className="lg:col-span-3">
                    <Visualization agents={activeAgents} activities={agentStations} logicLoad={logicLoad} />
                </div>
            </main>

            <footer className="text-center text-[10px] text-gray-600 uppercase tracking-[0.2em] py-4 border-t border-white/5">
                Powered by OpenClaw Gateway • Tycoon Visualization v0.1
            </footer>
        </div>
    )
}
