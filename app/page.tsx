"use client"

import { useEffect, useState } from "react"
import { Activity, Bot, CheckCircle2, Clock, ListTodo, Zap, ArrowRight, Wifi, WifiOff, Copy, Check } from "lucide-react"
import { useLanguage } from "./i18n/context"

type TaskSummary = { planned: number; in_progress: number; review: number; done: number; total: number }
type SessionInfo = { sessionKey: string; status: string }

export default function DashboardPage() {
    const { t } = useLanguage()
    const [taskStats, setTaskStats] = useState<TaskSummary>({ planned: 0, in_progress: 0, review: 0, done: 0, total: 0 })
    const [sessions, setSessions] = useState<SessionInfo[]>([])
    const [connected, setConnected] = useState(true)
    const [loading, setLoading] = useState(true)
    const [copied, setCopied] = useState(false)
    const [skillUrl, setSkillUrl] = useState("")

    useEffect(() => {
        if (typeof window !== "undefined") {
            setSkillUrl(`${window.location.origin}/skill`)
        }
    }, [])

    useEffect(() => {
        async function load() {
            try {
                const [tasksRes, sessionsRes] = await Promise.all([
                    fetch('/api/tasks'),
                    fetch('/api/monitor/sessions')
                ])
                const tasksData = await tasksRes.json()
                const sessionsData = await sessionsRes.json()

                if (tasksData.tasks) {
                    const tasks = tasksData.tasks
                    setTaskStats({
                        planned: tasks.filter((t: any) => t.status === 'planned').length,
                        in_progress: tasks.filter((t: any) => t.status === 'in_progress').length,
                        review: tasks.filter((t: any) => t.status === 'review').length,
                        done: tasks.filter((t: any) => t.status === 'done').length,
                        total: tasks.length,
                    })
                }
                if (sessionsData.sessions) setSessions(sessionsData.sessions)
            } catch (err) { console.error(err) }
            finally { setLoading(false) }
        }
        load()

        let es: EventSource
        let reconnectTimer: ReturnType<typeof setTimeout>
        function connect() {
            es = new EventSource('/api/monitor/events')
            es.onopen = () => setConnected(true)
            es.onmessage = () => { } // just keep alive
            es.onerror = () => {
                setConnected(false)
                es.close()
                reconnectTimer = setTimeout(connect, 3000)
            }
        }
        connect()
        return () => { es?.close(); clearTimeout(reconnectTimer) }
    }, [])

    const stats = [
        { label: 'To Do', value: taskStats.planned, icon: <ListTodo className="w-5 h-5" />, color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20' },
        { label: 'In Progress', value: taskStats.in_progress, icon: <Clock className="w-5 h-5" />, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
        { label: 'Review', value: taskStats.review, icon: <Activity className="w-5 h-5" />, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
        { label: 'Done', value: taskStats.done, icon: <CheckCircle2 className="w-5 h-5" />, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
    ]

    return (
        <div className="min-h-screen bg-[#070709] text-white p-6 md:p-12 font-sans relative overflow-hidden">
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
            <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />

            <div className="max-w-5xl mx-auto z-10 relative">
                <header className="relative mb-12 text-center pt-8 md:pt-0">
                    <div className="md:absolute right-0 top-0 flex justify-center md:justify-end items-center mb-6 md:mb-0">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${connected ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>
                            {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                            {connected ? 'Connected' : 'Offline'}
                        </span>
                    </div>
                    <h1 className="text-5xl font-extrabold bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent pb-2">
                        {t('dashboard.title')}
                    </h1>
                    <p className="mt-4 text-gray-400 text-lg flex items-center justify-center gap-2">
                        {t('dashboard.subtitle')}
                    </p>
                </header>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                    {stats.map(s => (
                        <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-5 flex flex-col items-center gap-2 backdrop-blur-xl`}>
                            <div className={s.color}>{s.icon}</div>
                            <span className="text-3xl font-extrabold text-white">{loading ? '–' : s.value}</span>
                            <span className={`text-xs font-medium uppercase tracking-wider ${s.color}`}>{s.label}</span>
                        </div>
                    ))}
                </div>

                {/* Total Tasks + Active Sessions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <Zap className="w-5 h-5 text-indigo-400" />
                            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">Total Tasks</h2>
                        </div>
                        <p className="text-4xl font-extrabold text-white">{loading ? '–' : taskStats.total}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <Bot className="w-5 h-5 text-indigo-400" />
                            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">Agent Sessions</h2>
                        </div>
                        <p className="text-4xl font-extrabold text-white">{loading ? '–' : sessions.length}</p>
                        {sessions.length > 0 && (
                            <div className="mt-3 space-y-1">
                                {sessions.slice(0, 5).map(s => (
                                    <div key={s.sessionKey} className="flex items-center justify-between text-xs">
                                        <span className="text-gray-400 font-mono truncate max-w-[200px]">{s.sessionKey}</span>
                                        <span className={`px-2 py-0.5 rounded-full font-medium ${s.status === 'thinking' ? 'bg-blue-500/20 text-blue-300' : 'bg-green-500/20 text-green-300'}`}>{s.status}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Install Section */}
                <div className="mb-10 text-center">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">
                        {t('dashboard.quick_install_title')}
                    </h3>
                    <div className="max-w-2xl mx-auto bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-6 backdrop-blur-xl relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/40" />
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                            <div className="flex items-center gap-4 flex-1 text-left">
                                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20">
                                    <Bot className="w-6 h-6 text-indigo-400" />
                                </div>
                                <div>
                                    <p className="text-lg font-medium text-gray-200 font-mono break-all md:break-normal">
                                        {t('dashboard.quick_install_text').replace('{url}', skillUrl)}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">
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
                                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shrink-0 ${copied ? 'bg-green-500 text-white' : 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/20'}`}
                            >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                {copied ? t('dashboard.copied') : t('dashboard.copy')}
                            </button>
                        </div>
                    </div>

                    <div className="max-w-2xl mx-auto mt-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 backdrop-blur-xl relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/40" />
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                            <div className="flex items-center gap-4 flex-1 text-left">
                                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20">
                                    <Zap className="w-6 h-6 text-emerald-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold uppercase tracking-widest text-emerald-500 mb-1">
                                        {t('dashboard.run_background_title')}
                                    </p>
                                    <p className="text-lg font-medium text-gray-200 font-mono break-all md:break-normal">
                                        pm2 start npm --name OpenClwList -- run dev
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">
                                        {t('dashboard.pm2_hint')}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText("pm2 start npm --name OpenClwList -- run dev")
                                    setCopied(true)
                                    setTimeout(() => setCopied(false), 2000)
                                }}
                                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shrink-0 ${copied ? 'bg-green-500 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20'}`}
                            >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                {copied ? t('dashboard.copied') : t('dashboard.copy')}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <a href="/tasks" className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-indigo-600 hover:bg-indigo-500 transition-all text-white font-semibold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-105">
                        <ListTodo className="w-5 h-5" /> Kanban Board <ArrowRight className="w-4 h-4" />
                    </a>
                    <a href="/agents" className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-white/5 hover:bg-white/10 transition-all text-white font-semibold border border-white/10 hover:scale-105">
                        <Bot className="w-5 h-5" /> Manage Agents <ArrowRight className="w-4 h-4" />
                    </a>
                </div>
            </div>
        </div>
    )
}
