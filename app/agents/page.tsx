"use client"

import { useEffect, useState, useRef } from "react"
import { Trash2, Edit2, Bot, Server, Check, X, RefreshCw, Activity, TerminalSquare, Download, Copy, FileText, Archive } from "lucide-react"
import JSZip from "jszip"
import { ThemeToggle } from "../components/ThemeToggle"
import { LanguageToggle } from "../components/LanguageToggle"
import { useLanguage } from "../i18n/context"

type Agent = { id: string; name?: string; workspace?: string; agentDir?: string, role?: string, tags?: string[] }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SubagentRun = any

export default function AgentsPage() {
    const { t } = useLanguage()
    const [agents, setAgents] = useState<Agent[]>([])
    const [subagents, setSubagents] = useState<Record<string, SubagentRun>>({})
    const [loading, setLoading] = useState(true)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState("")
    const [exportingId, setExportingId] = useState<string | null>(null)
    const [showExportMenu, setShowExportMenu] = useState<string | null>(null)

    const exportMenuRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
                setShowExportMenu(null)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const handleExport = async (agentId: string, type: 'copy' | 'single' | 'zip') => {
        setExportingId(agentId)
        try {
            const res = await fetch(`/api/agents/${agentId}/export`)
            const data = await res.json()
            if (!data.ok || !data.files) {
                alert(`Export failed: ${data.error || 'Unknown error'}`)
                return
            }

            const files = data.files as Record<string, string>

            if (type === 'copy' || type === 'single') {
                let combinedText = ""
                for (const [filename, content] of Object.entries(files)) {
                    combinedText += `# ${filename}\n\n${content}\n\n---\n\n`
                }

                if (type === 'copy') {
                    await navigator.clipboard.writeText(combinedText)
                    alert("Agent data copied to clipboard!")
                } else if (type === 'single') {
                    const blob = new Blob([combinedText], { type: 'text/markdown' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${agentId}-data.md`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                }
            } else if (type === 'zip') {
                const zip = new JSZip()
                for (const [filename, content] of Object.entries(files)) {
                    zip.file(filename, content)
                }
                const blob = await zip.generateAsync({ type: 'blob' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${agentId}-data.zip`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
            }
        } catch (err) {
            console.error('Export error:', err)
            alert('An error occurred during export.')
        } finally {
            setExportingId(null)
            setShowExportMenu(null)
        }
    }

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
        <div className="min-h-screen bg-surface text-ink p-6 md:p-12 overflow-x-hidden relative font-sans">
            {/* Ambient background */}
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
                    </div>
                    <div className="flex items-center gap-3">
                        <a href="/tasks" className="px-4 py-2 bg-accent-dim hover:bg-accent/15 text-accent rounded-full text-sm font-medium transition-colors border border-accent/20">
                            {t('agents.task_manager')}
                        </a>
                        <a href="/analytics" className="px-4 py-2 bg-ok-dim hover:bg-ok/15 text-ok rounded-full text-sm font-medium transition-colors border border-ok/20">
                            {t('agents.analytics')}
                        </a>
                        <a href="/schedules" className="px-4 py-2 bg-warn-dim hover:bg-warn/15 text-warn rounded-full text-sm font-medium transition-colors border border-warn/20">
                            {t('agents.cron_jobs')}
                        </a>
                        <button
                            onClick={loadData}
                            title={t('agents.refresh')}
                            className="p-3 bg-panel hover:bg-well rounded-2xl border border-rim shadow-sm transition-colors group"
                        >
                            <RefreshCw className={`w-5 h-5 text-dim transition-colors ${loading ? 'animate-spin text-accent' : 'group-hover:text-ink'}`} />
                        </button>
                        <LanguageToggle />
                        <ThemeToggle />
                    </div>
                </header>

                <section className="mb-20">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold flex items-center gap-3 text-ink">
                            <Bot className="text-accent w-6 h-6" />
                            {t('agents.primary')}
                            <span className="text-sm px-3 py-1 bg-well rounded-full text-dim font-medium ml-3">
                                {agents.length}
                            </span>
                        </h2>
                    </div>

                    {loading && agents.length === 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-44 bg-panel animate-pulse rounded-3xl border border-rim" />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-12">
                            {Array.from(new Set(agents.map(a => a.role || t('agents.uncategorized')))).sort((a, b) => a === t('agents.uncategorized') ? 1 : b === t('agents.uncategorized') ? -1 : a.localeCompare(b)).map(role => (
                                <div key={role}>
                                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-accent uppercase tracking-wider">
                                        <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                                        {role}
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {agents.filter(a => (a.role || t('agents.uncategorized')) === role).map(agent => (
                                            <div
                                                key={agent.id}
                                                className="group bg-panel border border-rim p-6 rounded-3xl flex flex-col justify-between hover:bg-well hover:border-rim-hi transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md shadow-sm"
                                            >
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
                                                                <button onClick={cancelEdit} className="p-1.5 bg-err-dim text-err rounded-lg hover:bg-err/20 transition-colors"><X className="w-4 h-4" /></button>
                                                            </div>
                                                        ) : (
                                                            <h3 className="text-xl font-bold truncate mb-1 text-ink tracking-wide">
                                                                {agent.name || agent.id}
                                                            </h3>
                                                        )}

                                                        <div className="flex items-center gap-2 text-xs text-mute mt-2 font-mono bg-well px-2 py-1 rounded w-fit max-w-full overflow-hidden text-ellipsis whitespace-nowrap border border-rim">
                                                            <TerminalSquare className="w-3 h-3 shrink-0" />
                                                            {agent.id}
                                                        </div>

                                                        {agent.tags && agent.tags.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5 mt-3">
                                                                {agent.tags.map(tag => (
                                                                    <span key={tag} className="text-[10px] uppercase tracking-wider font-bold bg-well text-dim px-2 py-0.5 rounded-full border border-rim">
                                                                        {tag}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
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
                                                        <div className="relative">
                                                            <button
                                                                onClick={() => setShowExportMenu(showExportMenu === agent.id ? null : agent.id)}
                                                                className="p-2 bg-info-dim hover:bg-info/20 rounded-xl text-info transition-colors"
                                                                title={t('agents.export')}
                                                                disabled={exportingId === agent.id}
                                                            >
                                                                {exportingId === agent.id ? (
                                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <Download className="w-4 h-4" />
                                                                )}
                                                            </button>

                                                            {showExportMenu === agent.id && (
                                                                <div ref={exportMenuRef} className="absolute bottom-full right-0 mb-2 w-48 bg-panel border border-rim rounded-xl shadow-lg z-50 overflow-hidden text-sm">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleExport(agent.id, 'copy'); }}
                                                                        className="w-full text-left px-4 py-3 hover:bg-well flex items-center gap-3 text-ink"
                                                                    >
                                                                        <Copy className="w-4 h-4 text-dim" />
                                                                        {t('agents.copy_clipboard')}
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleExport(agent.id, 'single'); }}
                                                                        className="w-full text-left px-4 py-3 hover:bg-well flex items-center gap-3 text-ink border-t border-rim"
                                                                    >
                                                                        <FileText className="w-4 h-4 text-info" />
                                                                        {t('agents.save_file')}
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleExport(agent.id, 'zip'); }}
                                                                        className="w-full text-left px-4 py-3 hover:bg-well flex items-center gap-3 text-ink border-t border-rim"
                                                                    >
                                                                        <Archive className="w-4 h-4 text-warn" />
                                                                        {t('agents.download_zip')}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <button
                                                            onClick={() => startEdit(agent.id, agent.name || agent.id)}
                                                            className="p-2 bg-well hover:bg-rim-hi rounded-xl text-dim hover:text-ink transition-colors"
                                                            title={t('agents.rename')}
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(agent.id)}
                                                            className="p-2 bg-err-dim hover:bg-err/20 rounded-xl text-err transition-colors"
                                                            title={t('agents.delete')}
                                                        >
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
                                {Object.entries(subagents).map(([runId, data]) => (
                                    <div key={runId} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-2xl bg-well border border-rim hover:border-rim-hi transition-colors">
                                        <div>
                                            <h4 className="font-semibold text-ink font-mono text-sm mb-1">{runId}</h4>
                                            <p className="text-sm text-dim truncate max-w-md">
                                                {JSON.stringify(data).slice(0, 80)}...
                                            </p>
                                        </div>
                                        <span className="mt-3 md:mt-0 px-3 py-1 bg-purple-500/15 border border-purple-500/25 text-purple-500 rounded-full text-xs font-semibold tracking-wide w-fit">
                                            {t('agents.running')}
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
