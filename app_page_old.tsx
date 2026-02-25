"use client"

import { useEffect, useState } from "react"
import { Activity, Bot, CheckCircle2, Clock, ListTodo, Zap, ArrowRight, Wifi, WifiOff, Copy, Check, RefreshCw, Moon, Sun } from "lucide-react"
import { useLanguage } from "./i18n/context"

type TaskSummary = { planned: number; in_progress: number; review: number; done: number; total: number }
type SessionInfo = { sessionKey: string; status: string }

export default function DashboardPage() {
    const { t, lang, setLang } = useLanguage()
    const [taskStats, setTaskStats] = useState<TaskSummary>({ planned: 0, in_progress: 0, review: 0, done: 0, total: 0 })
    const [sessions, setSessions] = useState<SessionInfo[]>([])
    const [connected, setConnected] = useState(true)
    const [loading, setLoading] = useState(true)
    const [copied, setCopied] = useState(false)
    const [updating, setUpdating] = useState(false)
    const [updateResult, setUpdateResult] = useState<{ success: boolean; output?: string; error?: string } | null>(null)
    const [skillUrl, setSkillUrl] = useState("")
    const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false)
    const [autoUpdateInterval, setAutoUpdateInterval] = useState(60)
    const [savingSettings, setSavingSettings] = useState(false)
    const [theme, setTheme] = useState<'light' | 'dark'>('dark')

    useEffect(() => {
        const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
        if (savedTheme) {
            setTheme(savedTheme)
            document.documentElement.setAttribute('data-theme', savedTheme)
        } else {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
            setTheme(isDark ? 'dark' : 'light')
        }
    }, [])

    function toggleTheme() {
        const next = theme === 'light' ? 'dark' : 'light'
        setTheme(next)
        document.documentElement.setAttribute('data-theme', next)
        localStorage.setItem('theme', next)
    }

    useEffect(() => {
        if (typeof window !== "undefined") {
            setSkillUrl(`${window.location.origin}/skill`)
        }
    }, [])

    useEffect(() => {
        async function load() {
            try {
                const [tasksRes, sessionsRes, settingsRes] = await Promise.all([
                    fetch('/api/tasks'),
                    fetch('/api/monitor/sessions'),
                    fetch('/api/system/settings')
                ])
                const tasksData = await tasksRes.json()
                const sessionsData = await sessionsRes.json()
                const settingsData = await settingsRes.json()

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
                if (settingsData.settings) {
                    setAutoUpdateEnabled(settingsData.settings.autoUpdateEnabled)
                    setAutoUpdateInterval(settingsData.settings.autoUpdateIntervalMinutes || 60)
                }
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

    async function handleUpdate() {
        setUpdating(true)
        setUpdateResult(null)
        try {
            const resp = await fetch("/api/system/update", { method: "POST" })
            const data = await resp.json()
            setUpdateResult(data)
        } catch (err: any) {
            setUpdateResult({ success: false, error: err.message })
        } finally {
            setUpdating(false)
        }
    }

    async function handleSaveSettings(enabled: boolean, interval: number) {
        setSavingSettings(true)
        try {
            const res = await fetch('/api/system/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ autoUpdateEnabled: enabled, autoUpdateIntervalMinutes: interval })
            })
            const data = await res.json()
            if (data.settings) {
                setAutoUpdateEnabled(data.settings.autoUpdateEnabled)
                setAutoUpdateInterval(data.settings.autoUpdateIntervalMinutes)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setSavingSettings(false)
        }
    }

    if (loading) return (
        <div className="min-h-screen bg-surface text-ink flex items-center justify-center">
            <div className="text-lg text-dim">{t('common.loading')}...</div>
        </div>
    )

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
                <header className="relative mb-8 md:mb-12 text-center pt-12 md:pt-0">
                    <div className="md:absolute right-0 top-0 flex flex-col md:flex-row justify-center md:justify-end items-center gap-4 mb-6 md:mb-0">
                        <div className="flex bg-panel border border-rim rounded-full p-1">
                            <button
                                onClick={() => setLang('en')}
                                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${lang === 'en' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-mute hover:text-dim'}`}
                            >
                                EN
                            </button>
                            <button
                                onClick={() => setLang('ru')}
                                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${lang === 'ru' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-mute hover:text-dim'}`}
                            >
                                RU
                            </button>
                        </div>
                        <button
                            onClick={toggleTheme}
                            className="bg-panel border border-rim hover:border-rim-hi p-2 rounded-full text-dim hover:text-ink transition-all"
                        >
                            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${connected ? 'text-ok bg-ok-dim border-ok/20' : 'text-err bg-err-dim border-err/20'}`}>
                            {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                            {connected ? t('app.connected') : t('app.offline')}
                        </span>
                    </div>
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
                            <span className="text-2xl md:text-3xl font-extrabold text-ink">{loading ? '–' : s.value}</span>
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
                        <p className="text-4xl font-extrabold text-ink">{loading ? '–' : taskStats.total}</p>
                    </div>
                    <div className="bg-panel border border-rim rounded-2xl p-6 backdrop-blur-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <Bot className="w-5 h-5 text-accent" />
                            <h2 className="text-sm font-bold uppercase tracking-wider text-dim">{t('dashboard.agent_sessions')}</h2>
                        </div>
                        <p className="text-4xl font-extrabold text-ink">{loading ? '–' : sessions.length}</p>
                        {sessions.length > 0 && (
                            <div className="mt-3 space-y-1">
                                {sessions.slice(0, 5).map(s => (
                                    <div key={s.sessionKey} className="flex items-center justify-between text-xs">
                                        <span className="text-dim font-mono truncate max-w-[200px]">{s.sessionKey}</span>
                                        <span className={`px-2 py-0.5 rounded-full font-medium ${s.status === 'thinking' ? 'bg-info/20 text-info' : 'bg-ok/20 text-ok'}`}>{s.status}</span>
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

                    <div className="max-w-2xl mx-auto mt-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 backdrop-blur-xl relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/40" />
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                            <div className="flex items-center gap-4 flex-1 text-left">
                                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20">
                                    <Zap className="w-6 h-6 text-emerald-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold uppercase tracking-widest text-ok mb-1">
                                        {t('dashboard.run_background_title')}
                                    </p>
                                    <p className="text-base md:text-lg font-medium text-ink font-mono break-all">
                                        pm2 start npm --name OpenClwList -- run dev
                                    </p>
                                    <p className="text-[10px] md:text-xs text-mute mt-1 uppercase tracking-widest font-bold">
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
                                className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shrink-0 w-full md:w-auto ${copied ? 'bg-green-500 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20'}`}
                            >
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                {copied ? t('dashboard.copied') : t('dashboard.copy')}
                            </button>
                        </div>
                    </div>

                    {/* Check for Updates Section */}
                    <div className="max-w-2xl mx-auto mt-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl p-6 backdrop-blur-xl relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/40" />
                        <div className="flex flex-col items-center gap-4">
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-4 text-left">
                                    <div className="w-12 h-12 rounded-xl bg-info/10 flex items-center justify-center shrink-0 border border-info/20">
                                        <Activity className={`w-6 h-6 text-info ${updating ? 'animate-pulse' : ''}`} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold uppercase tracking-widest text-info mb-1">
                                            {t('app.version')}
                                        </p>
                                        <p className="text-dim text-sm">
                                            {updating ? t('dashboard.update_running') : t('dashboard.update_check')}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleUpdate}
                                    disabled={updating}
                                    className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shrink-0 w-full md:w-auto ${updating ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'}`}
                                >
                                    {updating ? <Clock className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                    {updating ? t('dashboard.update_running') : t('dashboard.update_check')}
                                </button>
                            </div>

                            {updateResult && (
                                <div className={`w-full mt-4 p-4 rounded-xl border font-mono text-xs text-left overflow-auto max-h-48 ${updateResult.success ? 'bg-green-500/5 border-green-500/20 text-green-400' : 'bg-red-500/5 border-red-500/20 text-red-400'}`}>
                                    <p className="font-bold mb-2">
                                        {updateResult.success ? t('dashboard.update_success') : t('dashboard.update_error').replace('{error}', updateResult.error || '')}
                                    </p>
                                    {updateResult.output && (
                                        <pre className="whitespace-pre-wrap opacity-80">{updateResult.output}</pre>
                                    )}
                                </div>
                            )}

                            <div className="w-full mt-2 pt-4 border-t border-blue-500/20 flex flex-col md:flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <RefreshCw className="w-5 h-5 text-info" />
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-ink">{t('dashboard.auto_update')}</p>
                                        <p className="text-xs text-dim">{t('dashboard.auto_update_desc')}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="1"
                                            value={autoUpdateInterval}
                                            onChange={(e) => setAutoUpdateInterval(Number(e.target.value))}
                                            onBlur={() => handleSaveSettings(autoUpdateEnabled, autoUpdateInterval)}
                                            className="w-16 bg-panel border border-rim rounded-lg px-2 py-1 text-sm text-center outline-none focus:border-info/50 text-ink"
                                            disabled={savingSettings}
                                        />
                                        <span className="text-xs text-dim">{t('dashboard.minutes')}</span>
                                    </div>
                                    <button
                                        onClick={() => handleSaveSettings(!autoUpdateEnabled, autoUpdateInterval)}
                                        disabled={savingSettings}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${autoUpdateEnabled ? 'bg-info' : 'bg-mute'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${autoUpdateEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            </div>
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
                </div>
            </div>
        </div>
    )
}
