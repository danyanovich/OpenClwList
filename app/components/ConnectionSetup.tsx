"use client"

import { useState } from "react"
import { Server, Wifi, Key, ArrowRight, Loader2 } from "lucide-react"
import { useGateway } from "../contexts/GatewayContext"

export function ConnectionSetup() {
  const { setConnection, connecting, connected, gatewayUrl } = useGateway()
  const [url, setUrl] = useState(gatewayUrl || "ws://127.0.0.1:18789")
  const [token, setToken] = useState("")
  const [error, setError] = useState("")

  // Already connected — don't show setup screen
  if (connected) return null

  const handleConnect = () => {
    setError("")
    const trimmed = url.trim()
    if (!trimmed.startsWith("ws://") && !trimmed.startsWith("wss://")) {
      setError("URL must start with ws:// or wss://")
      return
    }
    setConnection(trimmed, token.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface p-4">
      {/* Ambient blobs */}
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/5 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/5 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
            <Server className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-black tracking-tight text-ink">OpenClwList</span>
        </div>

        <div className="bg-panel border border-rim rounded-3xl p-8 shadow-xl backdrop-blur-xl">
          <h1 className="text-2xl font-extrabold text-ink mb-1">Connect to Gateway</h1>
          <p className="text-dim text-sm mb-8">
            Enter your OpenClaw Gateway address. The app connects directly from your browser.
          </p>

          <div className="space-y-5">
            {/* Gateway URL */}
            <div>
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-dim mb-2">
                <Wifi className="w-3.5 h-3.5" />
                Gateway URL
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                placeholder="ws://127.0.0.1:18789"
                className="w-full bg-field border border-rim rounded-xl px-4 py-3 text-ink font-mono text-sm outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/20 transition-all"
              />
              <p className="mt-1.5 text-[11px] text-mute">
                For VPS: use an SSH tunnel (<code className="font-mono">ssh -L 18789:localhost:18789 user@vps</code>)
                and keep <code className="font-mono">ws://127.0.0.1:18789</code> — or set{" "}
                <code className="font-mono">wss://your-domain</code> if exposed via reverse proxy.
              </p>
            </div>

            {/* Token */}
            <div>
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-dim mb-2">
                <Key className="w-3.5 h-3.5" />
                API Token <span className="text-mute font-normal normal-case">(optional)</span>
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                placeholder="From ~/.openclaw/openclaw.json"
                className="w-full bg-field border border-rim rounded-xl px-4 py-3 text-ink font-mono text-sm outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/20 transition-all"
              />
            </div>

            {error && (
              <div className="bg-err/10 border border-err/20 text-err rounded-xl px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-accent hover:bg-accent-hover disabled:bg-mute disabled:cursor-not-allowed rounded-xl font-bold text-white transition-all shadow-lg shadow-accent/20"
            >
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  Connect
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          <p className="mt-6 text-[11px] text-mute text-center">
            Your device generates a unique Ed25519 keypair stored in your browser.
            No credentials leave your device.
          </p>
        </div>
      </div>
    </div>
  )
}

// Wrap children — show ConnectionSetup only when no URL is configured yet
export function GatewayGate({ children }: { children: React.ReactNode }) {
  const { gatewayUrl } = useGateway()

  if (!gatewayUrl) {
    return <ConnectionSetup />
  }

  return <>{children}</>
}
