"use client"

import { useMemo } from "react"
import { Activity, Bot, CheckCircle2, Clock, ListTodo, Zap, ArrowRight, Copy, Check } from "lucide-react"
import { useState } from "react"
import { useLanguage } from "./i18n/context"
import { useGateway } from "./contexts/GatewayContext"
import { loadTasks } from "./lib/tasks"

export default function DashboardPage() {
    const { t } = useLanguage()
    const { sessions, connected } = useGateway()
    const [copied, setCopied] = useState(false)

    const tasks = useMemo(() => loadTasks(), [])

    const taskStats = useMemo(() => ({
        planned: tasks.filter((t) => t.status === 'planned').length,
        in_progress: tasks.filter((t) => t.status === 'in_progress').length,
        review: tasks.filter((t) => t.status === 'review').length,
        done: tasks.filter((t) => t.status === 'done').length,
        total: tasks.length,
    }), [tasks])

    const sessionList = useMemo(() => Array.from(sessions.values()), [sessions])

    const skillUrl = typeof window !== 'undefined' ? `${window.location.origin}/skill` : ''

    const stats = [
        { label: t('dashboard.todo'), value: taskStats.planned, icon: <ListTodo className="w-5 h-5" />, color: 'text-dim', bg: 'bg-dim/10', border: 'border-dim/20' },
        { label: t('dashboard.in_progress'), value: taskStats.in_progress, icon: <Clock className="w-5 h-5" />, color: 'text-info', bg: 'bg-info/10', border: 'border-info/20' },
        { label: t('dashboard.review'), value: taskStats.review, icon: <Activity className="w-5 h-5" />, color: 'text-warn', bg: 'bg-warn/10', border: 'border-warn/20' },
        { label: t('dashboard.done'), value: taskStats.done, icon: <CheckCircle2 className="w-5 h-5" />, color: 'text-ok', bg: 'bg-ok/10', border: 'border-ok/20' },
    ]

    return (
        <div className="min-h-screen bg-surface text-ink p-6 md:p-12 font-sans relative overflow-hidden">
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/5 blur-[120px] pointer-events-none" />
            <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/5 blur-[120px] pointer-events-none" />

            <div className="max-w-5xl mx-auto z-10 relative">
                <header className="relative mb-8 md:mb-12 text-center pt-8 md:pt-0">
                    <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-br from-ink to-dim bg-clip-text text-transparent pb-2 leading-tight">
                        {t('dashboard.title')}
                    </h1>
                    <p className="mt-4 text-dim text-base md:text-lg flex items-center justify-center gap-2 px-4">
                        {t('dashboard.subtitle')}
                    </p>
                </header>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                    {stats.map(s => (
                        <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-4 md:p-5 flex flex-col items-center gap-2 backdrop-blur-xl`}>
                            <div className={s.color}>{s.icon}</div>
                            <span className="text-2xl md:text-3xl font-extrabold text-ink">{s.value}</span>
                            <span className={`text-[10px] md:text-xs font-medium uppercase tracking-wider ${s.color} text-center`}>{s.label}</span>
                        </div>
                    ))}
                </div>

                {/* Total Tasks + Active Sessions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                    <div className="bg-panel border border-rim rounded-2xl p-6 backdrop-blur-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <Zap className="w-5 h-5 text-accent" />
                            <h2 className="text-sm font-bold uppercase tracking-wider text-dim">{t('dashboard.total_tasks')}</h2>
                        </div>
                        <p className="text-4xl font-extrabold text-ink">{taskStats.total}</p>
                    </div>
                    <div className="bg-panel border border-rim rounded-2xl p-6 backdrop-blur-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <Bot className="w-5 h-5 text-accent" />
                            <h2 className="text-sm font-bold uppercase tracking-wider text-dim">{t('dashboard.agent_sessions')}</h2>
                        </div>
                        <p className="text-4xl font-extrabold text-ink">{sessionList.length}</p>
                        {sessionList.length > 0 && (
                            <div className="mt-3 space-y-1">
                                {sessionList.slice(0, 5).map(s => (
                                    <div key={s.sessionKey} className="flex items-center justify-between text-xs">
                                        <span className="text-dim font-mono truncate max-w-[200px]">{s.sessionKey}</span>
                                        <span className={`px-2 py-0.5 rounded-full font-medium ${s.status === 'thinking' ? 'bg-info/20 text-info' : 'bg-ok/20 text-ok'}`}>{s.status}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {!connected && (
                            <p className="mt-3 text-xs text-dim">Reconnecting…</p>
                        )}
                    </div>
                </div>

                {/* Quick Install */}
                <div className="mb-10 text-center">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">
                        {t('dashboard.quick_install_title')}
                    </h3>
                    <div className="max-w-2xl mx-auto bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-6 backdrop-blur-xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/40" />
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                            <div className="flex items-center gap-4 flex-1 text-left">
                                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20">
                                    <Bot className="w-6 h-6 text-indigo-400" />
                                </div>
                                <div>
                                    <p className="text-base md:text-lg font-medium text-ink font-mono break-all">
                                        {t('dashboard.quick_install_text').replace('{url}', skillUrl)}
                                    </p>
                                    <p className="text-[10px] md:text-xs text-mute mt-1 uppercase tracking-widest font-bold">
                                        {t('dashboard.quick_install_hint')}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(t('dashboard.quick_install_text').replace('{url}', skillUrl))
                                    setCopied(true)
                                    setTimeout(() => setCopied(false), 2000)
                                }}
                                className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shrink-0 w-full md:w-auto ${copied ? 'bg-green-500 text-white' : 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/20'}`}
                            >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                {copied ? t('dashboard.copied') : t('dashboard.copy')}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <a href="/tasks" className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-accent hover:bg-accent-hover transition-all text-white font-semibold shadow-lg shadow-accent/30 hover:shadow-accent/50 hover:scale-105">
                        <ListTodo className="w-5 h-5" /> {t('dashboard.kanban_board')} <ArrowRight className="w-4 h-4" />
                    </a>
                    <a href="/agents" className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-panel hover:bg-well transition-all text-ink font-semibold border border-rim hover:scale-105">
                        <Bot className="w-5 h-5" /> {t('dashboard.manage_agents')} <ArrowRight className="w-4 h-4" />
                    </a>
                    <a href="/simulation" className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-blue-600/10 hover:bg-blue-600/20 transition-all text-blue-500 font-semibold border border-blue-500/20 hover:scale-105">
                        <Activity className="w-5 h-5" /> {t('dashboard.simulation_hub') || 'Simulation Hub'} <ArrowRight className="w-4 h-4" />
                    </a>
                </div>
            </div>
        </div>
    )
}
