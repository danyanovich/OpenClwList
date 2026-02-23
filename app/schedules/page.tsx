"use client"

import { useEffect, useState } from "react"
import { CalendarClock, Trash2, Plus, ArrowLeft, Loader2, Bot, Info } from "lucide-react"
import { ThemeToggle } from "../components/ThemeToggle"
import { LanguageToggle } from "../components/LanguageToggle"
import { useLanguage } from "../i18n/context"

type ScheduleItem = {
    id: string
    cronExpr: string
    sessionKey: string
    prompt: string
    createdAt: number
    lastRunAt: number | null
}

export default function SchedulesPage() {
    const { t } = useLanguage()
    const [schedules, setSchedules] = useState<ScheduleItem[]>([])
    const [loading, setLoading] = useState(true)

    const [isAdding, setIsAdding] = useState(false)
    const [newCron, setNewCron] = useState("0 9 * * *")
    const [newSession, setNewSession] = useState("")
    const [newPrompt, setNewPrompt] = useState("")
    const [errorMsg, setErrorMsg] = useState("")

    useEffect(() => {
        loadSchedules()
    }, [])

    const loadSchedules = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/schedules')
            const json = await res.json()
            if (json.ok) setSchedules(json.schedules)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleCreate = async () => {
        setErrorMsg("")
        if (!newCron.trim() || !newSession.trim() || !newPrompt.trim()) {
            setErrorMsg("Please fill in all fields (cron, session key, prompt).")
            return
        }
        try {
            const res = await fetch('/api/schedules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cronExpr: newCron.trim(),
                    sessionKey: newSession.trim(),
                    prompt: newPrompt.trim()
                })
            })
            const json = await res.json()
            if (!json.ok) {
                setErrorMsg(json.error || "Failed to create schedule")
                return
            }
            setIsAdding(false)
            setNewCron("0 9 * * *")
            setNewSession("")
            setNewPrompt("")
            loadSchedules()
        } catch (err) {
            console.error(err)
            setErrorMsg("Network error occurred.")
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this schedule?')) return
        try {
            await fetch(`/api/schedules/${id}`, { method: 'DELETE' })
            loadSchedules()
        } catch (err) {
            console.error(err)
        }
    }

    return (
        <div className="min-h-screen bg-surface text-ink p-6 md:p-12 overflow-x-hidden relative font-sans">
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[150px] pointer-events-none" />

            <div className="max-w-6xl mx-auto z-10 relative">
                <div className="flex items-center justify-between mb-6">
                    <a href="/agents" className="inline-flex items-center gap-2 text-sm font-bold text-dim hover:text-accent transition-colors uppercase tracking-wider">
                        <ArrowLeft className="w-4 h-4" /> {t('app.back_nexus')}
                    </a>
                    <div className="flex items-center gap-2">
                        <LanguageToggle />
                        <ThemeToggle />
                    </div>
                </div>

                <header className="mb-12 border-b border-rim pb-8 flex flex-col md:flex-row md:justify-between items-start md:items-end gap-4">
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-ink pb-1 flex items-center gap-3">
                            <CalendarClock className="w-8 h-8 text-accent" />
                            {t('schedules.title')}
                        </h1>
                        <p className="text-dim mt-2 text-lg">{t('schedules.subtitle')}</p>
                    </div>
                    <button
                        onClick={() => setIsAdding(!isAdding)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition-colors shadow-lg shadow-accent/20"
                    >
                        {isAdding ? <ArrowLeft className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {isAdding ? t('app.cancel') : t('schedules.new')}
                    </button>
                </header>

                {isAdding && (
                    <div className="mb-12 bg-panel border border-rim p-6 md:p-8 rounded-3xl shadow-sm">
                        <h3 className="text-xl font-bold mb-6 text-ink">{t('schedules.create_title')}</h3>

                        {errorMsg && (
                            <div className="mb-6 p-4 bg-err-dim border border-err/20 text-err rounded-xl text-sm font-medium">
                                {errorMsg}
                            </div>
                        )}

                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-dim uppercase tracking-wider mb-2">{t('schedules.cron_label')}</label>
                                    <input
                                        type="text"
                                        value={newCron}
                                        onChange={(e) => setNewCron(e.target.value)}
                                        placeholder="0 9 * * *"
                                        className="w-full bg-field border border-rim rounded-xl px-4 py-3 text-ink outline-none focus:border-accent/50 placeholder:text-mute"
                                    />
                                    <p className="mt-2 text-xs text-mute flex items-center gap-1"><Info className="w-3 h-3" /> {t('schedules.cron_hint')}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-dim uppercase tracking-wider mb-2">{t('schedules.session_label')}</label>
                                    <input
                                        type="text"
                                        value={newSession}
                                        onChange={(e) => setNewSession(e.target.value)}
                                        placeholder="session_key_..."
                                        className="w-full bg-field border border-rim rounded-xl px-4 py-3 text-ink outline-none focus:border-accent/50 placeholder:text-mute"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-dim uppercase tracking-wider mb-2">{t('schedules.prompt_label')}</label>
                                <textarea
                                    value={newPrompt}
                                    onChange={(e) => setNewPrompt(e.target.value)}
                                    placeholder={t('schedules.prompt_placeholder')}
                                    rows={3}
                                    className="w-full bg-field border border-rim rounded-xl px-4 py-3 text-ink outline-none focus:border-accent/50 resize-y placeholder:text-mute"
                                ></textarea>
                            </div>
                            <div className="flex justify-end pt-2">
                                <button
                                    onClick={handleCreate}
                                    className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition-colors shadow-lg shadow-accent/20 disabled:opacity-50"
                                >
                                    {t('schedules.save')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="w-8 h-8 text-accent animate-spin" />
                    </div>
                ) : schedules.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-16 bg-panel border border-rim rounded-3xl text-center shadow-sm">
                        <CalendarClock className="w-16 h-16 text-mute mb-6" />
                        <h3 className="text-xl font-bold text-ink mb-2">{t('schedules.empty_title')}</h3>
                        <p className="text-dim max-w-md">{t('schedules.empty_body')}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {schedules.map(sched => (
                            <div key={sched.id} className="bg-panel border border-rim rounded-3xl p-6 flex flex-col hover:bg-well transition-colors shadow-sm">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-accent-dim border border-accent/20 text-accent font-mono text-sm px-3 py-1 rounded-lg shrink-0">
                                        {sched.cronExpr}
                                    </div>
                                    <button
                                        onClick={() => handleDelete(sched.id)}
                                        className="text-mute hover:text-err transition-colors p-2 rounded-full hover:bg-err-dim"
                                        title={t('schedules.delete')}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="text-dim text-sm mb-4 line-clamp-3 leading-relaxed flex-1">
                                    <span className="text-mute font-bold mr-2 uppercase text-[10px] tracking-wider">{t('schedules.prompt_badge')}</span>
                                    {sched.prompt}
                                </div>
                                <div className="border-t border-rim pt-4 mt-auto">
                                    <div className="flex items-center gap-2 text-xs text-dim mb-2 truncate">
                                        <Bot className="w-3 h-3 shrink-0" />
                                        <span className="truncate">{sched.sessionKey}</span>
                                    </div>
                                    <div className="text-[10px] uppercase font-bold text-mute tracking-wider">
                                        {t('schedules.last_run')} {sched.lastRunAt ? new Date(sched.lastRunAt).toLocaleString() : t('schedules.never')}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
