"use client"

import { useState } from "react"
import { Wifi, WifiOff, Server, Settings } from "lucide-react"
import { useLanguage } from "../i18n/context"
import { ThemeToggle } from "./ThemeToggle"
import { LanguageToggle } from "./LanguageToggle"
import { useGateway } from "../contexts/GatewayContext"
import Link from "next/link"

export function Header() {
    const { t } = useLanguage()
    const { connected, connecting, gatewayUrl, setConnection } = useGateway()
    const [showSettings, setShowSettings] = useState(false)
    const [editUrl, setEditUrl] = useState("")
    const [editToken, setEditToken] = useState("")

    const openSettings = () => {
        setEditUrl(gatewayUrl)
        setEditToken("")
        setShowSettings(true)
    }

    const handleSaveSettings = () => {
        if (editUrl.trim()) {
            setConnection(editUrl.trim(), editToken.trim())
        }
        setShowSettings(false)
    }

    return (
        <>
            <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between backdrop-blur-md bg-surface/70 border-b border-rim">
                <Link href="/" className="flex items-center gap-2 group">
                    <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center shadow-lg shadow-accent/20 group-hover:scale-110 transition-transform">
                        <Server className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xl font-black tracking-tight text-ink">OpenClwList</span>
                </Link>

                <div className="flex items-center gap-4">
                    {/* Connection status */}
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-all duration-300 ${
                        connected
                            ? 'bg-ok-dim border-ok/20 text-ok'
                            : connecting
                                ? 'bg-warn-dim border-warn/20 text-warn animate-pulse'
                                : 'bg-err-dim border-err/20 text-err animate-pulse'
                    }`}>
                        {connected
                            ? <Wifi className="w-3.5 h-3.5" />
                            : <WifiOff className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">
                            {connected
                                ? t('app.connected')
                                : connecting
                                    ? 'Connecting…'
                                    : t('app.offline')}
                        </span>
                    </div>

                    {/* Gateway URL badge */}
                    {gatewayUrl && (
                        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold bg-dim/10 border-dim/20 text-dim">
                            <span className="max-w-[160px] truncate">{gatewayUrl}</span>
                        </div>
                    )}

                    <div className="h-6 w-px bg-rim mx-1 hidden sm:block" />

                    <LanguageToggle />
                    <ThemeToggle />

                    {/* Settings button */}
                    <button
                        onClick={openSettings}
                        title="Gateway settings"
                        className="p-2 rounded-xl bg-panel hover:bg-well border border-rim transition-colors"
                    >
                        <Settings className="w-4 h-4 text-dim" />
                    </button>
                </div>
            </header>

            {/* Gateway settings modal */}
            {showSettings && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false) }}
                >
                    <div className="bg-panel border border-rim w-full max-w-sm rounded-3xl shadow-2xl p-8">
                        <h2 className="text-xl font-extrabold text-ink mb-6 flex items-center gap-2">
                            <Settings className="w-5 h-5 text-accent" /> Gateway Settings
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-dim mb-1.5 block">
                                    Gateway URL
                                </label>
                                <input
                                    type="text"
                                    value={editUrl}
                                    onChange={(e) => setEditUrl(e.target.value)}
                                    className="w-full bg-field border border-rim rounded-xl px-3 py-2 text-sm font-mono text-ink outline-none focus:border-accent/60 transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold uppercase tracking-wider text-dim mb-1.5 block">
                                    API Token <span className="text-mute font-normal normal-case">(optional)</span>
                                </label>
                                <input
                                    type="password"
                                    value={editToken}
                                    onChange={(e) => setEditToken(e.target.value)}
                                    placeholder="Leave blank to keep current"
                                    className="w-full bg-field border border-rim rounded-xl px-3 py-2 text-sm font-mono text-ink outline-none focus:border-accent/60 transition-all"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setShowSettings(false)}
                                    className="flex-1 px-4 py-2.5 bg-well hover:bg-rim border border-rim rounded-xl text-sm font-bold text-dim hover:text-ink transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveSettings}
                                    className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent-hover rounded-xl text-sm font-bold text-white transition-colors"
                                >
                                    Reconnect
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
