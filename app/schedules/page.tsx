"use client"

import { useEffect, useState, useCallback } from "react"
import { CalendarClock, Trash2, Plus, ArrowLeft, Bot, Info } from "lucide-react"
import { useLanguage } from "../i18n/context"
import { useGateway } from "../contexts/GatewayContext"
import {
    loadSchedules,
    createSchedule,
    deleteSchedule,
    markScheduleRun,
    msUntilNextRun,
    type ScheduleItem,
} from "../lib/schedules"

export default function SchedulesPage() {
    const { t } = useLanguage()
    const { request, connected } = useGateway()

    const [schedules, setSchedules] = useState<ScheduleItem[]>(() => loadSchedules())
    const [isAdding, setIsAdding] = useState(false)
    const [newCron, setNewCron] = useState("0 9 * * *")
    const [newSession, setNewSession] = useState("")
    const [newPrompt, setNewPrompt] = useState("")
    const [errorMsg, setErrorMsg] = useState("")

    const refresh = useCallback(() => setSchedules(loadSchedules()), [])

    const handleCreate = () => {
        setErrorMsg("")
        if (!newCron.trim() || !newSession.trim() || !newPrompt.trim()) {
            setErrorMsg("Please fill in all fields (cron, session key, prompt).")
            return
        }
        if (msUntilNextRun(newCron.trim()) === null) {
            setErrorMsg("Invalid cron expression. Use 5-part format: min hour dom month dow")
            return
        }
        createSchedule({ cronExpr: newCron.trim(), sessionKey: newSession.trim(), prompt: newPrompt.trim() })
        refresh()
        setIsAdding(false)
        setNewCron("0 9 * * *")
        setNewSession("")
        setNewPrompt("")
    }

    const handleDelete = (id: string) => {
        if (!confirm('Delete this schedule?')) return
        deleteSchedule(id)
        refresh()
    }

    // Browser-side cron runner — fires while page is open
    useEffect(() => {
        const timers = new Map<string, ReturnType<typeof setTimeout>>()

        function scheduleNext(item: ScheduleItem) {
            if (timers.has(item.id)) clearTimeout(timers.get(item.id)!)
            const delay = msUntilNextRun(item.cronExpr)
            if (delay === null) return
            const timer = setTimeout(async () => {
                if (connected) {
                    try {
                        await request('chat.send', {
                            sessionKey: item.sessionKey,
                            idempotencyKey: `sched:${item.id}:${Date.now()}`,
                            message: item.prompt,
                        })
                        markScheduleRun(item.id)
                        refresh()
                    } catch (err) {
                        console.warn('[schedules] chat.send failed:', err)
                    }
                }
                // Re-schedule for next run
                const updated = loadSchedules().find(s => s.id === item.id)
                if (updated) scheduleNext(updated)
            }, delay)
            timers.set(item.id, timer)
        }

        for (const sched of schedules) scheduleNext(sched)

        return () => {
            for (const timer of timers.values()) clearTimeout(timer)
            timers.clear()
        }
    // Re-run when schedules list changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schedules.map(s => s.id).join(','), connected])

    return (
        <div className="min-h-screen bg-surface text-ink p-6 md:p-12 overflow-x-hidden relative font-sans">
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-[150px] pointer-events-none" />

            <div className="max-w-6xl mx-auto z-10 relative">
                <div className="flex items-center justify-between mb-6">
                    <a href="/agents" className="inline-flex items-center gap-2 text-sm font-bold text-dim hover:text-accent transition-colors uppercase tracking-wider">
                        <ArrowLeft className="w-4 h-4" /> {t('app.back_nexus')}
                    </a>
                    {!connected && (
                        <span className="text-xs text-warn bg-warn/10 border border-warn/20 px-3 py-1 rounded-full">
                            Schedules only fire while connected
                        </span>
                    )}
                </div>

                <header className="mb-12 border-b border-rim pb-8 flex flex-col md:flex-row md:justify-between items-start md:items-end gap-4">
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-ink pb-1 flex items-center gap-3">
                            <CalendarClock className="w-8 h-8 text-accent" />
                            {t('schedules.title')}
                        </h1>
                        <p className="text-dim mt-2 text-lg">{t('schedules.subtitle')}</p>
                        <p className="text-mute text-xs mt-1">Schedules run in the browser — this tab must remain open</p>
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
                            <div className="mb-6 p-4 bg-err-dim border border-err/20 text-err rounded-xl text-sm font-medium">{errorMsg}</div>
                        )}
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-dim uppercase tracking-wider mb-2">{t('schedules.cron_label')}</label>
                                    <input type="text" value={newCron} onChange={(e) => setNewCron(e.target.value)} placeholder="0 9 * * *" className="w-full bg-field border border-rim rounded-xl px-4 py-3 text-ink outline-none focus:border-accent/50 placeholder:text-mute" />
                                    <p className="mt-2 text-xs text-mute flex items-center gap-1"><Info className="w-3 h-3" /> {t('schedules.cron_hint')}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-dim uppercase tracking-wider mb-2">{t('schedules.session_label')}</label>
                                    <input type="text" value={newSession} onChange={(e) => setNewSession(e.target.value)} placeholder="agent:main:main" className="w-full bg-field border border-rim rounded-xl px-4 py-3 text-ink outline-none focus:border-accent/50 placeholder:text-mute" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-dim uppercase tracking-wider mb-2">{t('schedules.prompt_label')}</label>
                                <textarea value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} placeholder={t('schedules.prompt_placeholder')} rows={3} className="w-full bg-field border border-rim rounded-xl px-4 py-3 text-ink outline-none focus:border-accent/50 resize-y placeholder:text-mute" />
                            </div>
                            <div className="flex justify-end pt-2">
                                <button onClick={handleCreate} className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition-colors shadow-lg shadow-accent/20">
                                    {t('schedules.save')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {schedules.length === 0 ? (
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
                                    <button onClick={() => handleDelete(sched.id)} className="text-mute hover:text-err transition-colors p-2 rounded-full hover:bg-err-dim" title={t('schedules.delete')}>
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
