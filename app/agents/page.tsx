"use client"

import { useState, useMemo } from "react"
import { Trash2, Edit2, Bot, Server, Check, X, Activity } from "lucide-react"
import { useLanguage } from "../i18n/context"
import { useGateway } from "../contexts/GatewayContext"

const AGENT_META_KEY = "openclaw_agent_meta"

type AgentMeta = { id: string; name?: string; role?: string; tags?: string[] }
type AgentMetaStore = Record<string, AgentMeta>

function readMeta(): AgentMetaStore {
    try { return JSON.parse(localStorage.getItem(AGENT_META_KEY) ?? '{}') as AgentMetaStore } catch { return {} }
}
function writeMeta(store: AgentMetaStore): void {
    try { localStorage.setItem(AGENT_META_KEY, JSON.stringify(store)) } catch { }
}

export default function AgentsPage() {
    const { t } = useLanguage()
    const { sessions, runs } = useGateway()

    const [meta, setMeta] = useState<AgentMetaStore>(readMeta)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState("")

    // Agents derived from live gateway sessions
    const agents = useMemo(() => {
        const agentMap = new Map<string, { id: string; sessionCount: number; lastActivityAt: number }>()
        for (const session of sessions.values()) {
            const existing = agentMap.get(session.agentId)
            agentMap.set(session.agentId, {
                id: session.agentId,
                sessionCount: (existing?.sessionCount ?? 0) + 1,
                lastActivityAt: Math.max(existing?.lastActivityAt ?? 0, session.lastActivityAt),
            })
        }
        return Array.from(agentMap.values()).map(a => ({
            ...a,
            name: meta[a.id]?.name,
            role: meta[a.id]?.role,
            tags: meta[a.id]?.tags,
            discovered: true,
        }))
    }, [sessions, meta])

    // Subagents derived from runs
    const subagents = useMemo(() => {
        const result: Record<string, { runId: string; sessionKey: string; state: string }> = {}
        for (const run of runs.values()) {
            if (run.sessionKey?.includes(':subagent:')) {
                result[run.runId] = { runId: run.runId, sessionKey: run.sessionKey, state: run.state }
            }
        }
        return result
    }, [runs])

    const byRole = useMemo(() => {
        const groups = new Map<string, typeof agents>()
        for (const a of agents) {
            const role = a.role || t('agents.uncategorized')
            if (!groups.has(role)) groups.set(role, [])
            groups.get(role)!.push(a)
        }
        return groups
    }, [agents, t])

    const handleRename = (id: string) => {
        if (!editName.trim()) return
        const current = readMeta()
        current[id] = { ...(current[id] ?? { id }), name: editName.trim() }
        writeMeta(current)
        setMeta({ ...current })
        setEditingId(null)
    }

    const handleDelete = (id: string) => {
        if (!confirm('Remove agent from registry? (does not stop running sessions)')) return
        const current = readMeta()
        delete current[id]
        writeMeta(current)
        setMeta({ ...current })
    }

    return (
        <div className="min-h-screen bg-surface text-ink p-6 md:p-12 overflow-x-hidden relative font-sans">
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/5 blur-[150px] pointer-events-none" />
            <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/5 blur-[150px] pointer-events-none" />

            <div className="max-w-6xl mx-auto z-10 relative">
                <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 border-b border-rim pb-8">
                    <div className="mb-4 md:mb-0">
                        <h1 className="text-4xl font-extrabold tracking-tight text-ink pb-1 flex items-center gap-3">
                            <Server className="w-8 h-8 text-accent" />
                            {t('agents.title')}
                        </h1>
                        <p className="text-dim mt-2 text-lg">{t('agents.subtitle')}</p>
                        <p className="text-mute text-xs mt-1">Agents are discovered from live gateway sessions</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <a href="/tasks" className="px-4 py-2 bg-accent-dim hover:bg-accent/15 text-accent rounded-full text-sm font-medium transition-colors border border-accent/20">{t('agents.task_manager')}</a>
                        <a href="/analytics" className="px-4 py-2 bg-ok-dim hover:bg-ok/15 text-ok rounded-full text-sm font-medium transition-colors border border-ok/20">{t('agents.analytics')}</a>
                        <a href="/schedules" className="px-4 py-2 bg-warn-dim hover:bg-warn/15 text-warn rounded-full text-sm font-medium transition-colors border border-warn/20">{t('agents.cron_jobs')}</a>
                    </div>
                </header>

                {/* Primary Agents */}
                <section className="mb-20">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold flex items-center gap-3 text-ink">
                            <Bot className="text-accent w-6 h-6" />
                            {t('agents.primary')}
                            <span className="text-sm px-3 py-1 bg-well rounded-full text-dim font-medium ml-3">{agents.length}</span>
                        </h2>
                    </div>

                    {agents.length === 0 ? (
                        <div className="text-center py-16 text-dim">
                            <Bot className="w-12 h-12 mx-auto mb-4 text-mute opacity-30" />
                            <p className="text-lg font-medium">No active agents</p>
                            <p className="text-sm text-mute mt-2">Agents appear here when they connect to the Gateway</p>
                        </div>
                    ) : (
                        <div className="space-y-12">
                            {Array.from(byRole.entries())
                                .sort(([a], [b]) => a === t('agents.uncategorized') ? 1 : b === t('agents.uncategorized') ? -1 : a.localeCompare(b))
                                .map(([role, roleAgents]) => (
                                    <div key={role}>
                                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-accent uppercase tracking-wider">
                                            <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                                            {role}
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {roleAgents.map(agent => (
                                                <div key={agent.id} className="group bg-panel border border-rim p-6 rounded-3xl flex flex-col justify-between hover:bg-well hover:border-rim-hi transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md shadow-sm">
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex-1 min-w-0 mr-4">
                                                            {editingId === agent.id ? (
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <input
                                                                        value={editName}
                                                                        onChange={(e) => setEditName(e.target.value)}
                                                                        onKeyDown={(e) => e.key === 'Enter' && handleRename(agent.id)}
                                                                        className="bg-field border border-accent/50 rounded-lg px-3 py-1.5 w-full text-ink text-lg font-bold outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
                                                                        autoFocus
                                                                    />
                                                                    <button onClick={() => handleRename(agent.id)} className="p-1.5 bg-ok-dim text-ok rounded-lg hover:bg-ok/20 transition-colors"><Check className="w-4 h-4" /></button>
                                                                    <button onClick={() => setEditingId(null)} className="p-1.5 bg-err-dim text-err rounded-lg hover:bg-err/20 transition-colors"><X className="w-4 h-4" /></button>
                                                                </div>
                                                            ) : (
                                                                <h3 className="text-xl font-bold truncate mb-1 text-ink tracking-wide">{agent.name || agent.id}</h3>
                                                            )}
                                                            <div className="flex items-center gap-2 text-xs text-mute mt-2 font-mono bg-well px-2 py-1 rounded w-fit max-w-full overflow-hidden text-ellipsis whitespace-nowrap border border-rim">
                                                                {agent.id}
                                                            </div>
                                                            <div className="flex flex-wrap gap-1.5 mt-3">
                                                                <span className="text-[10px] uppercase tracking-wider font-bold bg-info-dim text-info px-2 py-0.5 rounded-full border border-info/20">live</span>
                                                                <span className="text-[10px] uppercase tracking-wider font-bold bg-well text-dim px-2 py-0.5 rounded-full border border-rim">
                                                                    {agent.sessionCount} session{agent.sessionCount !== 1 ? 's' : ''}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="mt-6 flex items-center justify-between">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="relative flex h-2.5 w-2.5">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ok opacity-60"></span>
                                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-ok"></span>
                                                            </span>
                                                            <span className="text-sm text-dim font-medium">{t('agents.active')}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                            <button onClick={() => { setEditingId(agent.id); setEditName(agent.name || agent.id) }} className="p-2 bg-well hover:bg-rim-hi rounded-xl text-dim hover:text-ink transition-colors" title={t('agents.rename')}>
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button onClick={() => handleDelete(agent.id)} className="p-2 bg-err-dim hover:bg-err/20 rounded-xl text-err transition-colors" title={t('agents.delete')}>
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </section>

                {/* Subagents */}
                <section>
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold flex items-center gap-3 text-ink">
                            <Activity className="text-warn w-6 h-6" />
                            {t('agents.subagents')}
                        </h2>
                    </div>
                    <div className="bg-panel border border-rim rounded-3xl p-8 shadow-sm">
                        {Object.keys(subagents).length === 0 ? (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-well rounded-full flex items-center justify-center mx-auto mb-4 border border-rim">
                                    <Activity className="w-8 h-8 text-mute" />
                                </div>
                                <p className="text-dim text-lg">{t('agents.no_subagents')}</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {Object.values(subagents).map(sa => (
                                    <div key={sa.runId} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-2xl bg-well border border-rim hover:border-rim-hi transition-colors">
                                        <div>
                                            <h4 className="font-semibold text-ink font-mono text-sm mb-1">{sa.runId}</h4>
                                            <p className="text-sm text-dim truncate max-w-md">{sa.sessionKey}</p>
                                        </div>
                                        <span className={`mt-3 md:mt-0 px-3 py-1 rounded-full text-xs font-semibold tracking-wide w-fit ${sa.state === 'running' ? 'bg-purple-500/15 border border-purple-500/25 text-purple-500' : 'bg-ok/15 border border-ok/25 text-ok'}`}>
                                            {sa.state}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    )
}
