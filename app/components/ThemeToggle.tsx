"use client"

import { useEffect, useState } from "react"
import { Sun, Moon } from "lucide-react"

export function ThemeToggle() {
    const [theme, setTheme] = useState<'light' | 'dark'>('dark')

    useEffect(() => {
        const t = (document.documentElement.getAttribute('data-theme') ?? 'dark') as 'light' | 'dark'
        setTheme(t)
    }, [])

    const toggle = () => {
        const next: 'light' | 'dark' = theme === 'dark' ? 'light' : 'dark'
        setTheme(next)
        document.documentElement.setAttribute('data-theme', next)
        localStorage.setItem('theme', next)
    }

    return (
        <button
            onClick={toggle}
            className="p-2 rounded-xl border border-rim bg-panel hover:bg-well text-dim hover:text-ink transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
    )
}
