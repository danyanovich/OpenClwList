"use client"

import { useEffect, useState } from "react"
import { Wifi, WifiOff, Server } from "lucide-react"
import { useLanguage } from "../i18n/context"
import { ThemeToggle } from "./ThemeToggle"
import { LanguageToggle } from "./LanguageToggle"
import Link from "next/link"

type Capabilities = {
    mode: "local" | "remote"
    dangerousActionsEnabled: boolean
    authEnabled?: boolean
}

type HostsResponse = {
    hosts?: Array<{ id: string; name: string; connected?: boolean }>
    activeHostId?: string
}

export function Header() {
    const { t } = useLanguage()
    const [connected, setConnected] = useState(true)
    const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
    const [activeHostId, setActiveHostId] = useState<string>("")
    const [hosts, setHosts] = useState<Array<{ id: string; name: string; connected?: boolean }>>([])
    const [switchingHost, setSwitchingHost] = useState(false)
    const [switchingMode, setSwitchingMode] = useState(false)

    useEffect(() => {
        let es: EventSource
        let reconnectTimer: ReturnType<typeof setTimeout>

        function connect() {
            es = new EventSource('/api/monitor/events')
            es.onopen = () => setConnected(true)
            es.onmessage = () => { } // keep alive
            es.onerror = () => {
                setConnected(false)
                es.close()
                reconnectTimer = setTimeout(connect, 3000)
            }
        }

        connect()
        return () => {
            es?.close()
            clearTimeout(reconnectTimer)
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        async function loadMeta() {
            try {
                const [capsRes, hostsRes] = await Promise.all([
                    fetch('/api/system/capabilities'),
                    fetch('/api/hosts'),
                ])
                if (!capsRes.ok || !hostsRes.ok) return
                const caps = await capsRes.json() as Capabilities
                const hosts = await hostsRes.json() as HostsResponse
                if (cancelled) return
                setCapabilities(caps)
                setActiveHostId(hosts.activeHostId || "")
                setHosts(Array.isArray(hosts.hosts) ? hosts.hosts : [])
            } catch {
                // ignore; header should stay functional even when APIs are unavailable
            }
        }
        void loadMeta()
        return () => {
            cancelled = true
        }
    }, [])

    async function handleHostChange(nextHostId: string) {
        if (!nextHostId || nextHostId === activeHostId) return
        setSwitchingHost(true)
        try {
            const res = await fetch('/api/hosts/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hostId: nextHostId }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data?.error || `Failed to switch host (${res.status})`)
            }
            setActiveHostId(nextHostId)
            setTimeout(() => window.location.reload(), 200)
        } catch (error) {
            console.error(error)
            setSwitchingHost(false)
        }
    }

    function handleLogout() {
        document.cookie = "ops_ui_token=; Path=/; Max-Age=0; SameSite=Lax"
        window.location.reload()
    }

    async function handleModeToggle() {
        if (!capabilities || switchingMode) return
        setSwitchingMode(true)
        const targetMode = capabilities.mode === 'local' ? 'remote' : 'local'
        try {
            const res = await fetch('/api/system/mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: targetMode }),
            })
            if (!res.ok) throw new Error('Failed to toggle mode')

            // if switching to remote, we'll likely need a token check, so clear local token if they intend to enter a new one? 
            // no, keep token but if invalid AuthGate handles it.
            window.location.reload()
        } catch (error) {
            console.error(error)
            setSwitchingMode(false)
        }
    }

    return (
        <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between backdrop-blur-md bg-surface/70 border-b border-rim">
            <Link href="/" className="flex items-center gap-2 group">
                <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center shadow-lg shadow-accent/20 group-hover:scale-110 transition-transform">
                    <Server className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-black tracking-tight text-ink">OpenClwList</span>
            </Link>

            <div className="flex items-center gap-4">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-all duration-300 ${connected
                    ? 'bg-ok-dim border-ok/20 text-ok'
                    : 'bg-err-dim border-err/20 text-err animate-pulse'
                    }`}>
                    {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">
                        {connected ? t('app.connected') : t('app.offline')}
                    </span>
                </div>

                {capabilities && (
                    <>
                        {hosts.length > 1 && (
                            <div className="hidden lg:flex items-center gap-2 px-2 py-1.5 rounded-full border border-rim bg-panel/70">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-dim px-1">Host</span>
                                <select
                                    value={activeHostId}
                                    onChange={(e) => void handleHostChange(e.target.value)}
                                    disabled={switchingHost}
                                    className="bg-transparent text-xs font-semibold text-ink outline-none pr-2"
                                >
                                    {hosts.map((host) => (
                                        <option key={host.id} value={host.id} className="text-black">
                                            {host.name || host.id}{host.connected ? " • on" : ""}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <button
                            onClick={handleModeToggle}
                            disabled={switchingMode}
                            title={`Click to switch to ${capabilities.mode === 'local' ? 'REMOTE' : 'LOCAL'}`}
                            className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-all hover:opacity-80 disabled:opacity-50 ${capabilities.mode === 'remote'
                                ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                : 'bg-dim/10 border-dim/20 text-dim'
                                }`}>
                            <span>{switchingMode ? '...' : capabilities.mode.toUpperCase()}</span>
                            {activeHostId && <span className="opacity-70">· {activeHostId}</span>}
                        </button>
                        {!capabilities.dangerousActionsEnabled && (
                            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold bg-amber-500/10 border-amber-500/20 text-amber-400">
                                <span>READ-MOSTLY</span>
                            </div>
                        )}
                        {capabilities.authEnabled && (
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold border-rim bg-panel/70 text-dim hover:text-ink"
                                title="Clear dashboard auth token"
                            >
                                <span>LOGOUT</span>
                            </button>
                        )}
                    </>
                )}

                <div className="h-6 w-px bg-rim mx-1 hidden sm:block" />

                <LanguageToggle />
                <ThemeToggle />
            </div>
        </header>
    )
}
