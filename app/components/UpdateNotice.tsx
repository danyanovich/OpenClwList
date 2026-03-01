"use client"

import { useEffect, useState } from "react"
import { X, Download } from "lucide-react"
import { checkForUpdate, getNewVersion } from "../lib/auto-update"

const CHECK_INTERVAL = 60 * 60 * 1000 // Check every hour

export function UpdateNotice() {
  const [showUpdate, setShowUpdate] = useState(false)
  const [newVersion, setNewVersion] = useState<string | null>(null)

  useEffect(() => {
    // Check immediately on mount
    void checkForUpdate().then(hasUpdate => {
      if (hasUpdate) {
        setShowUpdate(true)
        setNewVersion(getNewVersion())
      }
    })

    // Then check periodically
    const interval = setInterval(() => {
      void checkForUpdate().then(hasUpdate => {
        if (hasUpdate) {
          setShowUpdate(true)
          setNewVersion(getNewVersion())
        }
      })
    }, CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [])

  if (!showUpdate) return null

  return (
    <div className="fixed bottom-6 right-6 z-40 max-w-sm bg-panel border border-accent/30 rounded-2xl p-4 shadow-lg backdrop-blur-xl flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="text-sm font-bold text-ink">Update Available</h3>
          <p className="text-xs text-dim mt-0.5">
            Version {newVersion} is ready. Reload to apply.
          </p>
        </div>
        <button
          onClick={() => setShowUpdate(false)}
          className="p-1 hover:bg-well rounded-lg transition-colors text-mute hover:text-dim shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setShowUpdate(false)}
          className="flex-1 text-xs px-3 py-2 bg-well hover:bg-rim rounded-lg text-dim hover:text-ink transition-colors font-medium"
        >
          Dismiss
        </button>
        <button
          onClick={() => window.location.reload()}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 bg-accent hover:bg-accent-hover rounded-lg text-white transition-colors font-bold"
        >
          <Download className="w-3.5 h-3.5" />
          Update Now
        </button>
      </div>
    </div>
  )
}
