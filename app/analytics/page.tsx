"use client"

import { useEffect, useState } from "react"
import { BarChart3, TrendingUp, DollarSign, Activity, ArrowLeft } from "lucide-react"
import { ThemeToggle } from "../components/ThemeToggle"
import { LanguageToggle } from "../components/LanguageToggle"
import { useLanguage } from "../i18n/context"

type AnalyticsData = {
    agentId: string
    date: string
    promptTokens: number
    completionTokens: number
    totalCost: number
}

export default function AnalyticsPage() {
    const { t } = useLanguage()
    const [data, setData] = useState<AnalyticsData[]>([])
    const [loading, setLoading] = useState(true)
    const [days, setDays] = useState(30)

    useEffect(() => {
        loadData()
    }, [days])

    const loadData = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/analytics?days=${days}`)
            const json = await res.json()
            if (json.ok) {
                setData(json.data)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const totalCost = data.reduce((sum, item) => sum + item.totalCost, 0)
    const totalTokens = data.reduce((sum, item) => sum + item.promptTokens + item.completionTokens, 0)

    const byAgent = data.reduce((acc, item) => {
        if (!acc[item.agentId]) acc[item.agentId] = { cost: 0, tokens: 0 }
        acc[item.agentId].cost += item.totalCost
        acc[item.agentId].tokens += item.promptTokens + item.completionTokens
        return acc
    }, {} as Record<string, { cost: number; tokens: number }>)

    const maxCost = Math.max(...Object.values(byAgent).map(a => a.cost), 1)

    return (
        <div className="min-h-screen bg-surface text-ink p-6 md:p-12 overflow-x-hidden relative font-sans">
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/5 blur-[150px] pointer-events-none" />

            <div className="max-w-6xl mx-auto z-10 relative">
                <div className="flex items-center justify-between mb-6">
                    <a href="/agents" className="inline-flex items-center gap-2 text-sm font-bold text-dim hover:text-ok transition-colors uppercase tracking-wider">
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
                            <BarChart3 className="w-8 h-8 text-ok" />
                            {t('analytics.title')}
                        </h1>
                        <p className="text-dim mt-2 text-lg">{t('analytics.subtitle')}</p>
                    </div>
                    <select
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                        className="bg-field border border-rim rounded-xl px-4 py-2 text-ink outline-none focus:border-ok/50 uppercase text-xs font-bold tracking-wider"
                    >
                        <option value={7}>{t('analytics.last_7')}</option>
                        <option value={30}>{t('analytics.last_30')}</option>
                        <option value={90}>{t('analytics.last_90')}</option>
                    </select>
                </header>

                {loading ? (
                    <div className="flex h-64 items-center justify-center">
                        <Activity className="w-8 h-8 text-ok animate-spin" />
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                            <div className="bg-panel border border-rim p-6 rounded-3xl flex items-center gap-6 shadow-sm">
                                <div className="p-4 bg-ok-dim rounded-2xl text-ok">
                                    <DollarSign className="w-8 h-8" />
                                </div>
                                <div>
                                    <p className="text-sm text-dim font-bold uppercase tracking-wider mb-1">{t('analytics.total_cost')}</p>
                                    <p className="text-4xl font-black text-ink">${totalCost.toFixed(4)}</p>
                                </div>
                            </div>
                            <div className="bg-panel border border-rim p-6 rounded-3xl flex items-center gap-6 shadow-sm">
                                <div className="p-4 bg-info-dim rounded-2xl text-info">
                                    <TrendingUp className="w-8 h-8" />
                                </div>
                                <div>
                                    <p className="text-sm text-dim font-bold uppercase tracking-wider mb-1">{t('analytics.total_tokens')}</p>
                                    <p className="text-4xl font-black text-ink">{totalTokens.toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-panel border border-rim p-8 rounded-3xl mb-12 shadow-sm">
                            <h3 className="text-xl font-bold mb-8 text-ink flex items-center gap-3">
                                {t('analytics.attribution')}
                            </h3>
                            {Object.entries(byAgent).length === 0 ? (
                                <p className="text-mute italic">{t('analytics.no_data')}</p>
                            ) : (
                                <div className="space-y-6">
                                    {Object.entries(byAgent)
                                        .sort((a, b) => b[1].cost - a[1].cost)
                                        .map(([agentId, stats]) => (
                                            <div key={agentId}>
                                                <div className="flex justify-between text-sm mb-2">
                                                    <span className="font-bold text-ink truncate pr-4">{agentId}</span>
                                                    <span className="font-mono text-ok shrink-0 font-bold">
                                                        ${stats.cost.toFixed(4)} <span className="opacity-50 text-xs text-dim">({stats.tokens.toLocaleString()} tkns)</span>
                                                    </span>
                                                </div>
                                                <div className="h-3 bg-well rounded-full overflow-hidden border border-rim">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full"
                                                        style={{ width: `${Math.max((stats.cost / maxCost) * 100, 1)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
