"use client"

import { FormEvent, ReactNode, useEffect, useState } from "react"

type HealthResponse = {
    ok?: boolean
    mode?: "local" | "remote"
}

type CapabilitiesResponse = {
    ok?: boolean
    mode?: "local" | "remote"
    authEnabled?: boolean
    dangerousActionsEnabled?: boolean
}

type HostsResponse = {
    activeHostId?: string
    hosts?: Array<{ id: string; name: string; gatewayUrl?: string; connected?: boolean }>
}

type DiagnosticsResponse = {
    diagnostics?: { connected?: boolean; lastError?: string }
    activeHostId?: string
}

type BootstrapStatusResponse = {
    ok?: boolean
    bootstrapRequired?: boolean
    mode?: "local" | "remote"
    authConfigured?: boolean
    dangerousActionsEnabled?: boolean
}

type ForbiddenNotice = {
    message: string
    url?: string
}

function setOpsTokenCookie(token: string) {
    document.cookie = `ops_ui_token=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`
}

function clearOpsTokenCookie() {
    document.cookie = "ops_ui_token=; Path=/; Max-Age=0; SameSite=Lax"
}

async function safeJson<T>(res: Response): Promise<T | null> {
    try {
        return await res.json() as T
    } catch {
        return null
    }
}

export function AuthGate({ children }: { children: ReactNode }) {
    const [booting, setBooting] = useState(true)
    const [authRequired, setAuthRequired] = useState(false)
    const [mode, setMode] = useState<"local" | "remote" | null>(null)
    const [token, setToken] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [authError, setAuthError] = useState<string | null>(null)
    const [networkError, setNetworkError] = useState<string | null>(null)
    const [forbiddenNotice, setForbiddenNotice] = useState<ForbiddenNotice | null>(null)
    const [bootstrapRequired, setBootstrapRequired] = useState(false)
    const [bootstrapBusy, setBootstrapBusy] = useState(false)
    const [bootstrapError, setBootstrapError] = useState<string | null>(null)
    const [bootstrapDashboardToken, setBootstrapDashboardToken] = useState("")
    const [bootstrapGatewayToken, setBootstrapGatewayToken] = useState("")
    const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(null)
    const [activeHostId, setActiveHostId] = useState("")
    const [hosts, setHosts] = useState<Array<{ id: string; name: string; gatewayUrl?: string; connected?: boolean }>>([])
    const [gatewayConnected, setGatewayConnected] = useState<boolean | null>(null)
    const [gatewayLastError, setGatewayLastError] = useState("")
    const [gatewayUrlInput, setGatewayUrlInput] = useState("ws://127.0.0.1:18789")
    const [gatewayTokenInput, setGatewayTokenInput] = useState("")
    const [gatewaySetupBusy, setGatewaySetupBusy] = useState(false)
    const [gatewaySetupResult, setGatewaySetupResult] = useState<{ ok: boolean; message: string } | null>(null)

    useEffect(() => {
        const originalFetch = window.fetch.bind(window)

        window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            const res = await originalFetch(input, init)
            if (res.status === 401) {
                setAuthRequired(true)
                setAuthError(null)
            } else if (res.status === 403) {
                let message = "Action is disabled by server policy (read-mostly mode)."
                try {
                    const payload = await res.clone().json() as { error?: string }
                    if (payload?.error) message = payload.error
                } catch {
                    // ignore parse failures
                }
                setForbiddenNotice({
                    message,
                    url: typeof input === "string" ? input : input instanceof URL ? input.toString() : undefined,
                })
            }
            return res
        }

        return () => {
            window.fetch = originalFetch
        }
    }, [])

    useEffect(() => {
        let cancelled = false

        async function loadGatewayState() {
            const [hostsRes, diagnosticsRes] = await Promise.all([
                fetch("/api/hosts"),
                fetch("/api/monitor/diagnostics"),
            ])
            if (hostsRes.ok) {
                const hostsData = await safeJson<HostsResponse>(hostsRes)
                if (hostsData?.activeHostId) setActiveHostId(hostsData.activeHostId)
                if (Array.isArray(hostsData?.hosts)) {
                    setHosts(hostsData!.hosts!)
                    const activeHost = hostsData!.hosts!.find((h) => h.id === hostsData?.activeHostId) || hostsData!.hosts![0]
                    if (activeHost?.gatewayUrl) setGatewayUrlInput(activeHost.gatewayUrl)
                }
            }
            if (diagnosticsRes.ok) {
                const diagnosticsData = await safeJson<DiagnosticsResponse>(diagnosticsRes)
                setGatewayConnected(Boolean(diagnosticsData?.diagnostics?.connected))
                setGatewayLastError(typeof diagnosticsData?.diagnostics?.lastError === "string" ? diagnosticsData.diagnostics.lastError : "")
            }
        }

        async function bootstrap() {
            setBooting(true)
            setNetworkError(null)
            try {
                const healthRes = await fetch("/health")
                if (healthRes.ok) {
                    const health = await safeJson<HealthResponse>(healthRes)
                    if (!cancelled && (health?.mode === "local" || health?.mode === "remote")) {
                        setMode(health.mode)
                    }
                }

                const bootstrapRes = await fetch("/api/setup/bootstrap-status")
                if (cancelled) return
                if (bootstrapRes.ok) {
                    const bootstrapData = await safeJson<BootstrapStatusResponse>(bootstrapRes)
                    if (bootstrapData?.mode === "local" || bootstrapData?.mode === "remote") {
                        setMode(bootstrapData.mode)
                    }
                    if (bootstrapData?.bootstrapRequired) {
                        await loadGatewayState()
                        setBootstrapRequired(true)
                        setBooting(false)
                        return
                    }
                }

                const capsRes = await fetch("/api/system/capabilities")
                if (cancelled) return
                if (capsRes.status === 401) {
                    setAuthRequired(true)
                    setBooting(false)
                    return
                }
                if (!capsRes.ok) {
                    const payload = await safeJson<{ error?: string }>(capsRes)
                    setNetworkError(payload?.error || `Failed to load capabilities (${capsRes.status})`)
                    setBooting(false)
                    return
                }
                const caps = await safeJson<CapabilitiesResponse>(capsRes)
                if (caps?.mode === "local" || caps?.mode === "remote") setMode(caps.mode)
                setCapabilities(caps)
                setBootstrapRequired(false)
                setAuthRequired(false)
                setAuthError(null)
                await loadGatewayState()
                setBooting(false)
            } catch (error) {
                if (cancelled) return
                setNetworkError(error instanceof Error ? error.message : String(error))
                setBooting(false)
            }
        }

        void bootstrap()
        return () => {
            cancelled = true
        }
    }, [])

    async function handleBootstrapSetup(event: FormEvent) {
        event.preventDefault()
        if (!bootstrapDashboardToken.trim()) {
            setBootstrapError("Dashboard access token is required")
            return
        }
        setBootstrapBusy(true)
        setBootstrapError(null)
        try {
            const res = await fetch("/api/setup/bootstrap", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    dashboardToken: bootstrapDashboardToken.trim(),
                    gatewayToken: bootstrapGatewayToken.trim() || undefined,
                    gatewayUrl: gatewayUrlInput.trim() || undefined,
                    hostId: activeHostId || undefined,
                    connect: true,
                }),
            })
            const data = await safeJson<{ ok?: boolean; error?: string }>(res)
            if (!res.ok) {
                setBootstrapError(data?.error || `Bootstrap setup failed (${res.status})`)
                setBootstrapBusy(false)
                return
            }
            setOpsTokenCookie(bootstrapDashboardToken.trim())
            window.location.reload()
        } catch (error) {
            setBootstrapError(error instanceof Error ? error.message : String(error))
            setBootstrapBusy(false)
        }
    }

    async function handleGatewaySetup(event: FormEvent) {
        event.preventDefault()
        if (!activeHostId) {
            setGatewaySetupResult({ ok: false, message: "No active host selected" })
            return
        }
        if (!gatewayTokenInput.trim()) {
            setGatewaySetupResult({ ok: false, message: "OpenClaw token is required" })
            return
        }
        setGatewaySetupBusy(true)
        setGatewaySetupResult(null)
        try {
            const res = await fetch(`/api/hosts/${encodeURIComponent(activeHostId)}/credentials`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    gatewayUrl: gatewayUrlInput.trim(),
                    gatewayToken: gatewayTokenInput.trim(),
                    connect: true,
                }),
            })
            const data = await safeJson<{ ok?: boolean; error?: string; warning?: string }>(res)
            if (!res.ok) {
                setGatewaySetupResult({ ok: false, message: data?.error || `Failed (${res.status})` })
                return
            }
            setGatewayConnected(true)
            setGatewayLastError("")
            setGatewayTokenInput("")
            setGatewaySetupResult({ ok: true, message: data?.warning ? `Connected (warning: ${data.warning})` : "Connected to OpenClaw" })
            setTimeout(() => window.location.reload(), 700)
        } catch (error) {
            setGatewaySetupResult({ ok: false, message: error instanceof Error ? error.message : String(error) })
        } finally {
            setGatewaySetupBusy(false)
        }
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault()
        const trimmed = token.trim()
        if (!trimmed) {
            setAuthError("Token is required")
            return
        }
        setSubmitting(true)
        setAuthError(null)
        setNetworkError(null)
        try {
            setOpsTokenCookie(trimmed)
            const capsRes = await fetch("/api/system/capabilities")
            if (capsRes.status === 401) {
                clearOpsTokenCookie()
                setAuthError("Invalid token")
                setSubmitting(false)
                return
            }
            if (!capsRes.ok) {
                const payload = await safeJson<{ error?: string }>(capsRes)
                clearOpsTokenCookie()
                setAuthError(payload?.error || `Request failed (${capsRes.status})`)
                setSubmitting(false)
                return
            }
            window.location.reload()
        } catch (error) {
            clearOpsTokenCookie()
            setAuthError(error instanceof Error ? error.message : String(error))
            setSubmitting(false)
        }
    }

    if (booting) {
        return (
            <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-6">
                <div className="rounded-2xl border border-rim bg-panel/80 backdrop-blur-xl px-6 py-5 text-sm text-dim">
                    Checking dashboard access...
                </div>
            </div>
        )
    }

    if (authRequired) {
        return (
            <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-6 py-10">
                <div className="w-full max-w-md rounded-3xl border border-rim bg-panel/90 backdrop-blur-xl p-6 shadow-2xl shadow-black/10">
                    <div className="mb-5">
                        <div className="text-xs uppercase tracking-[0.2em] text-dim font-bold">
                            {mode === "remote" ? "Remote Access" : "Protected API"}
                        </div>
                        <h1 className="mt-2 text-2xl font-black text-ink">Enter Access Token</h1>
                        <p className="mt-2 text-sm text-dim">
                            This dashboard requires a Bearer token. The token will be stored in a browser cookie (`ops_ui_token`) for this site.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <label className="block">
                            <span className="text-xs font-bold uppercase tracking-wider text-dim">Bearer token</span>
                            <input
                                type="password"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                autoFocus
                                autoComplete="off"
                                spellCheck={false}
                                className="mt-2 w-full rounded-xl border border-rim bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-info/50"
                                placeholder="Paste OPS_UI_BEARER_TOKEN"
                                disabled={submitting}
                            />
                        </label>

                        {(authError || networkError) && (
                            <div className="rounded-xl border border-err/20 bg-err/10 px-4 py-3 text-sm text-err">
                                {authError || networkError}
                            </div>
                        )}

                        <div className="flex items-center gap-3">
                            <button
                                type="submit"
                                disabled={submitting}
                                className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition-colors ${submitting ? "bg-mute text-dim cursor-not-allowed" : "bg-info text-white hover:bg-info/90"}`}
                            >
                                {submitting ? "Checking..." : "Unlock dashboard"}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    clearOpsTokenCookie()
                                    setToken("")
                                    setAuthError(null)
                                }}
                                disabled={submitting}
                                className="rounded-xl border border-rim px-4 py-3 text-sm font-semibold text-dim hover:text-ink"
                            >
                                Clear
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )
    }

    if (bootstrapRequired) {
        return (
            <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 py-8">
                <div className="w-full max-w-3xl rounded-3xl border border-rim bg-panel/95 backdrop-blur-xl p-6 md:p-7 shadow-2xl shadow-black/20">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-info font-bold">First Run Setup</div>
                            <h1 className="mt-2 text-2xl md:text-3xl font-black text-ink">Configure dashboard access and connect OpenClaw</h1>
                            <p className="mt-2 text-sm text-dim">
                                No `.env` is required for the basic setup. We will save the dashboard token and OpenClaw connection credentials on this server.
                            </p>
                        </div>
                        <div className="rounded-full border border-info/20 bg-info/10 px-3 py-1.5 text-xs font-bold text-info whitespace-nowrap">
                            {mode === "remote" ? "Remote-safe setup" : "Bootstrap setup"}
                        </div>
                    </div>

                    <form onSubmit={handleBootstrapSetup} className="mt-6 space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="block">
                                <span className="text-xs font-bold uppercase tracking-wider text-dim">Dashboard access token</span>
                                <input
                                    type="password"
                                    value={bootstrapDashboardToken}
                                    onChange={(e) => setBootstrapDashboardToken(e.target.value)}
                                    autoFocus
                                    className="mt-2 w-full rounded-xl border border-rim bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-info/50"
                                    placeholder="Create a token for web access"
                                    disabled={bootstrapBusy}
                                />
                                <span className="mt-2 block text-xs text-dim">You will use this token to log in to the dashboard from a browser.</span>
                            </label>

                            <label className="block">
                                <span className="text-xs font-bold uppercase tracking-wider text-dim">OpenClaw gateway token (optional)</span>
                                <input
                                    type="password"
                                    value={bootstrapGatewayToken}
                                    onChange={(e) => setBootstrapGatewayToken(e.target.value)}
                                    className="mt-2 w-full rounded-xl border border-rim bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-info/50"
                                    placeholder="Paste OpenClaw token to connect now"
                                    disabled={bootstrapBusy}
                                />
                                <span className="mt-2 block text-xs text-dim">You can leave this empty and configure OpenClaw later in the setup overlay.</span>
                            </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="block">
                                <span className="text-xs font-bold uppercase tracking-wider text-dim">Gateway URL</span>
                                <input
                                    value={gatewayUrlInput}
                                    onChange={(e) => setGatewayUrlInput(e.target.value)}
                                    className="mt-2 w-full rounded-xl border border-rim bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-info/50"
                                    placeholder="ws://127.0.0.1:18789"
                                    disabled={bootstrapBusy}
                                />
                            </label>

                            <label className="block">
                                <span className="text-xs font-bold uppercase tracking-wider text-dim">Host</span>
                                <select
                                    value={activeHostId}
                                    onChange={(e) => setActiveHostId(e.target.value)}
                                    className="mt-2 w-full rounded-xl border border-rim bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-info/50"
                                    disabled={bootstrapBusy || hosts.length === 0}
                                >
                                    {hosts.length === 0 ? (
                                        <option value="">(default host)</option>
                                    ) : (
                                        hosts.map((host) => (
                                            <option key={host.id} value={host.id}>{host.name || host.id}</option>
                                        ))
                                    )}
                                </select>
                            </label>
                        </div>

                        {bootstrapError && (
                            <div className="rounded-xl border border-err/20 bg-err/10 px-4 py-3 text-sm text-err">
                                {bootstrapError}
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setBootstrapDashboardToken("")
                                    setBootstrapGatewayToken("")
                                    setBootstrapError(null)
                                }}
                                disabled={bootstrapBusy}
                                className="rounded-xl border border-rim px-4 py-3 text-sm font-semibold text-dim hover:text-ink"
                            >
                                Clear
                            </button>
                            <button
                                type="submit"
                                disabled={bootstrapBusy}
                                className={`rounded-xl px-4 py-3 text-sm font-bold transition-colors ${bootstrapBusy ? "bg-mute text-dim cursor-not-allowed" : "bg-info text-white hover:bg-info/90"}`}
                            >
                                {bootstrapBusy ? "Saving..." : "Save & Start"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <>
            {forbiddenNotice && (
                <div className="fixed top-20 left-4 right-4 z-[70] mx-auto max-w-3xl rounded-2xl border border-amber-500/20 bg-amber-500/10 backdrop-blur px-4 py-3 text-sm text-amber-300 shadow-lg">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="font-bold uppercase tracking-wider text-xs">Policy restriction</div>
                            <div className="mt-1">{forbiddenNotice.message}</div>
                            {forbiddenNotice.url && (
                                <div className="mt-1 text-xs opacity-80 font-mono truncate">{forbiddenNotice.url}</div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setForbiddenNotice(null)}
                            className="text-xs font-bold uppercase tracking-wider opacity-80 hover:opacity-100"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}
            {gatewayConnected === false && (
                <div className="fixed inset-0 z-[65] bg-black/35 backdrop-blur-[2px] flex items-center justify-center p-4">
                    <div className="w-full max-w-2xl rounded-3xl border border-amber-500/20 bg-panel/95 backdrop-blur-xl p-5 md:p-6 shadow-2xl shadow-black/20">
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <div>
                                <div className="text-xs uppercase tracking-[0.2em] text-amber-400 font-bold">OpenClaw Setup</div>
                                <h2 className="mt-2 text-xl md:text-2xl font-black text-ink">Paste OpenClaw token to connect</h2>
                                <p className="mt-2 text-sm text-dim">
                                    The token is stored on this dashboard server and used to connect the active OpenClaw host immediately.
                                </p>
                                <p className="mt-1 text-xs text-dim">
                                    Active host: <span className="font-mono text-ink">{activeHostId || "(unknown)"}</span>
                                </p>
                                {gatewayLastError && (
                                    <p className="mt-2 text-xs text-amber-300 font-mono break-all">{gatewayLastError}</p>
                                )}
                            </div>
                            <div className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 whitespace-nowrap">
                                Gateway disconnected
                            </div>
                        </div>

                        <form onSubmit={handleGatewaySetup} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <label className="block">
                                    <span className="text-xs font-bold uppercase tracking-wider text-dim">Gateway URL</span>
                                    <input
                                        value={gatewayUrlInput}
                                        onChange={(e) => setGatewayUrlInput(e.target.value)}
                                        className="mt-2 w-full rounded-xl border border-rim bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-info/50"
                                        placeholder="ws://127.0.0.1:18789"
                                        disabled={gatewaySetupBusy}
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-bold uppercase tracking-wider text-dim">OpenClaw token</span>
                                    <input
                                        type="password"
                                        value={gatewayTokenInput}
                                        onChange={(e) => setGatewayTokenInput(e.target.value)}
                                        className="mt-2 w-full rounded-xl border border-rim bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-info/50"
                                        placeholder="Paste gateway token"
                                        autoFocus
                                        disabled={gatewaySetupBusy}
                                    />
                                </label>
                            </div>

                            {hosts.length > 1 && (
                                <div className="text-xs text-dim">
                                    Multiple hosts configured. Switch active host first (API `/api/hosts/select`) if this token is for another OpenClaw instance.
                                </div>
                            )}

                            {capabilities && capabilities.dangerousActionsEnabled === false && (
                                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                                    Setup is blocked by server policy (`dangerous actions disabled`). Enable `OPS_UI_REMOTE_ALLOW_DANGEROUS_ACTIONS=true` temporarily to perform initial token setup in remote mode.
                                </div>
                            )}

                            {gatewaySetupResult && (
                                <div className={`rounded-xl border px-4 py-3 text-sm ${gatewaySetupResult.ok ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-err/20 bg-err/10 text-err"}`}>
                                    {gatewaySetupResult.message}
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setGatewayTokenInput("")
                                        setGatewaySetupResult(null)
                                    }}
                                    disabled={gatewaySetupBusy}
                                    className="rounded-xl border border-rim px-4 py-3 text-sm font-semibold text-dim hover:text-ink"
                                >
                                    Clear
                                </button>
                                <button
                                    type="submit"
                                    disabled={gatewaySetupBusy || capabilities?.dangerousActionsEnabled === false}
                                    className={`rounded-xl px-4 py-3 text-sm font-bold transition-colors ${gatewaySetupBusy || capabilities?.dangerousActionsEnabled === false ? "bg-mute text-dim cursor-not-allowed" : "bg-amber-500 text-black hover:bg-amber-400"}`}
                                >
                                    {gatewaySetupBusy ? "Connecting..." : "Save Token & Connect"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {children}
        </>
    )
}
