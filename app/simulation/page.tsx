"use client"

import { useMemo } from 'react'
import { Visualization } from '../components/Visualization'
import { Bot, Activity, ArrowLeft } from 'lucide-react'
import { useGateway } from '../contexts/GatewayContext'

type Station = 'chat' | 'tasks' | 'tools' | 'browser' | 'db' | 'cron' | 'system'

export default function SimulationPage() {
    const { sessions, runs, events, connected } = useGateway()

    // Active agents from gateway sessions
    const activeAgents = useMemo(() => {
        const agentMap = new Map<string, { id: string; name: string; status: 'idle' | 'active' | 'thinking' }>()
        for (const session of sessions.values()) {
            const existing = agentMap.get(session.agentId)
            if (existing?.status === 'thinking') continue
            const visStatus: 'idle' | 'active' | 'thinking' = session.status === 'thinking' ? 'thinking' : session.status === 'active' ? 'active' : 'idle'
            agentMap.set(session.agentId, { id: session.agentId, name: session.agentId, status: visStatus })
        }
        return Array.from(agentMap.values())
    }, [sessions])

    // Recent activities from gateway events
    const activities = useMemo(() => {
        return events
            .slice(-20)
            .reverse()
            .map(e => {
                const date = new Date(e.ts)
                const hh = String(date.getHours()).padStart(2, '0')
                const mm = String(date.getMinutes()).padStart(2, '0')
                const kind = e.kind || 'event'
                const tool = e.toolName
                let label = kind
                if (tool) label += `:${tool}`
                return {
                    ts: e.ts,
                    text: `[${hh}:${mm}] ${e.sessionKey} · ${label}`,
                    sessionKey: e.sessionKey,
                    kind,
                    toolName: tool,
                }
            })
    }, [events])

    // Logic load from running runs
    const logicLoad = useMemo(() => {
        const running = Array.from(runs.values()).filter(r => r.state === 'running').length
        return Math.max(0, Math.min(100, running * 10))
    }, [runs])

    // Map sessions → station per agent
    const sessionAgentMap = useMemo(() => {
        const m: Record<string, string> = {}
        for (const session of sessions.values()) {
            if (session.sessionKey && session.agentId) m[session.sessionKey] = session.agentId
        }
        return m
    }, [sessions])

    const agentStations = useMemo(() => {
        if (sessions.size === 0 || activities.length === 0) return []
        const stationByAgent = new Map<string, { station: Station; text: string }>()
        for (const a of [...activities].reverse()) {
            const agentId = sessionAgentMap[a.sessionKey || '']
            if (!agentId) continue
            const kind = (a.kind || '').toLowerCase()
            const tool = (a.toolName || '').toLowerCase()
            let station: Station = 'system'
            let label = ''
            if (kind === 'chat') { station = 'chat'; label = 'Replying to user' }
            else if (kind === 'tool' || tool) {
                label = `Using ${a.toolName}`
                if (tool.includes('browser') || tool.includes('page') || tool.includes('click')) station = 'browser'
                else if (tool.startsWith('cron') || tool.includes('schedule')) station = 'cron'
                else if (tool.includes('db') || tool.includes('sqlite') || tool.includes('query')) station = 'db'
                else if (tool.includes('task') || tool.includes('run')) station = 'tasks'
                else station = 'tools'
            } else if (kind.includes('task')) { station = 'tasks'; label = 'Managing tasks' }
            stationByAgent.set(agentId, { station, text: label || a.text })
        }
        return Array.from(stationByAgent.entries()).map(([agentId, { station, text }]) => ({ agentId, station, lastLabel: text }))
    }, [activities, sessionAgentMap, sessions.size])

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
                    <div className={`px-3 py-1 border rounded-full text-[10px] font-bold uppercase tracking-wider ${connected ? 'bg-blue-500/10 border-blue-500/20 text-blue-500 animate-pulse' : 'bg-err/10 border-err/20 text-err'}`}>
                        {connected ? 'Live Gateway Stream' : 'Reconnecting…'}
                    </div>
                </div>
            </header>

            <main className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Sidebar */}
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
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${agent.status === 'thinking' ? 'bg-blue-500/20 text-blue-400' : agent.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-300'}`}>
                                        {agent.status === 'thinking' ? 'Thinking' : agent.status === 'active' ? 'Active' : 'Idle'}
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

                {/* Main Visualization */}
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
