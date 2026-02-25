"use client"

import { useEffect, useState } from "react"
import { Wifi, WifiOff, Server } from "lucide-react"
import { useLanguage } from "../i18n/context"
import { ThemeToggle } from "./ThemeToggle"
import { LanguageToggle } from "./LanguageToggle"
import Link from "next/link"

export function Header() {
    const { t } = useLanguage()
    const [connected, setConnected] = useState(true)

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

                <div className="h-6 w-px bg-rim mx-1 hidden sm:block" />

                <LanguageToggle />
                <ThemeToggle />
            </div>
        </header>
    )
}
