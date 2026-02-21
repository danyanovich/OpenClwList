"use client"

import { useEffect, useState } from "react"
import { Trash2, Edit2, Bot, Server, Check, X, RefreshCw, Activity, TerminalSquare } from "lucide-react"

type Agent = { id: string; name?: string; workspace?: string; agentDir?: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SubagentRun = any

export default function AgentsPage() {
    const [agents, setAgents] = useState<Agent[]>([])
    const [subagents, setSubagents] = useState<Record<string, SubagentRun>>({})
    const [loading, setLoading] = useState(true)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState("")

    const loadData = async () => {
        try {
            setLoading(true)
            const res = await fetch('/api/agents')
            const data = await res.json()
            if (data.ok) {
                setAgents(data.agents || [])
                setSubagents(data.subagents || {})
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [])

    const startEdit = (id: string, currentName: string) => {
        setEditingId(id)
        setEditName(currentName)
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditName("")
    }

    const handleRename = async (id: string) => {
        if (!editName.trim()) return
        try {
            const res = await fetch(`/api/agents/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName })
            })
            if (res.ok) {
                setEditingId(null)
                loadData()
            }
        } catch (err) {
            console.error(err)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this agent?')) return
        try {
            const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' })
            if (res.ok) {
                loadData()
            }
        } catch (err) {
            console.error(err)
        }
    }

    return (
        <div className="min-h-screen bg-[#070709] text-white p-6 md:p-12 overflow-x-hidden relative font-sans">
            {/* Animated subtle background blobs */}
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[150px] pointer-events-none" />
            <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/10 blur-[150px] pointer-events-none" />

            <div className="max-w-6xl mx-auto z-10 relative">
                <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 border-b border-white/5 pb-8">
                    <div className="mb-4 md:mb-0">
                        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent pb-1 flex items-center gap-3">
                            <Server className="w-8 h-8 text-blue-400" />
                            OpenClaw Nexus
                        </h1>
                        <p className="text-slate-400 mt-2 text-lg">Central hub for dynamic agent orchestration and fleet ops.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <a href="/tasks" className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded-full text-sm font-medium transition-colors border border-indigo-500/20 shadow-lg">
                            Task Manager &rarr;
                        </a>
                        <button
                            onClick={loadData}
                            title="Refresh Fleet"
                            className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 group"
                        >
                            <RefreshCw className={`w-5 h-5 text-gray-300 transition-colors ${loading ? 'animate-spin text-blue-400' : 'group-hover:text-white'}`} />
                        </button>
                    </div>
                </header>

                <section className="mb-20">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold flex items-center gap-3 text-white/90">
                            <Bot className="text-indigo-400 w-6 h-6" />
                            Primary Agents
                            <span className="text-sm px-3 py-1 bg-white/10 rounded-full text-white/60 font-medium ml-3">
                                {agents.length}
                            </span>
                        </h2>
                    </div>

                    {loading && agents.length === 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-44 bg-white/5 animate-pulse rounded-3xl border border-white/5" />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {agents.map(agent => (
                                <div
                                    key={agent.id}
                                    className="group bg-white/5 backdrop-blur-md border border-white/10 p-6 rounded-3xl flex flex-col justify-between hover:bg-white/10 hover:border-white/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-500/10"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0 mr-4">
                                            {editingId === agent.id ? (
                                                <div className="flex items-center gap-2 mb-2">
                                                    <input
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleRename(agent.id)}
                                                        className="bg-black/40 border border-blue-500/50 rounded-lg px-3 py-1.5 w-full text-white text-lg font-bold outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all"
                                                        autoFocus
                                                    />
                                                    <button onClick={() => handleRename(agent.id)} className="p-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"><Check className="w-4 h-4" /></button>
                                                    <button onClick={cancelEdit} className="p-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"><X className="w-4 h-4" /></button>
                                                </div>
                                            ) : (
                                                <h3 className="text-xl font-bold truncate mb-1 text-white/95 tracking-wide">
                                                    {agent.name || agent.id}
                                                </h3>
                                            )}

                                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-2 font-mono bg-black/30 px-2 py-1 rounded w-fit max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                                                <TerminalSquare className="w-3 h-3 shrink-0" />
                                                {agent.id}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                            <span className="relative flex h-2.5 w-2.5">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                            </span>
                                            <span className="text-sm text-slate-300 font-medium">Active</span>
                                        </div>

                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            <button
                                                onClick={() => startEdit(agent.id, agent.name || agent.id)}
                                                className="p-2 bg-white/5 hover:bg-white/20 rounded-xl text-slate-300 hover:text-white transition-all"
                                                title="Rename Agent"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(agent.id)}
                                                className="p-2 bg-red-500/10 hover:bg-red-500/30 rounded-xl text-red-400 transition-all border border-red-500/0 hover:border-red-500/30"
                                                title="Delete Agent"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section>
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold flex items-center gap-3 text-white/90">
                            <Activity className="text-purple-400 w-6 h-6" />
                            Active Sub-agents
                        </h2>
                    </div>

                    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8 shadow-xl">
                        {Object.keys(subagents).length === 0 ? (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                                    <Activity className="w-8 h-8 text-white/20" />
                                </div>
                                <p className="text-slate-400 text-lg">No sub-agent runs currently active.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {Object.entries(subagents).map(([runId, data]) => (
                                    <div key={runId} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-2xl bg-black/40 border border-white/5 hover:border-white/10 transition-colors">
                                        <div>
                                            <h4 className="font-semibold text-white/90 font-mono text-sm mb-1">{runId}</h4>
                                            <p className="text-sm text-slate-400 truncate max-w-md">
                                                {JSON.stringify(data).slice(0, 80)}...
                                            </p>
                                        </div>
                                        <span className="mt-3 md:mt-0 px-3 py-1 bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded-full text-xs font-semibold tracking-wide w-fit">
                                            Running
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
