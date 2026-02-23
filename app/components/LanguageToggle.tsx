"use client"

import { useLanguage } from "../i18n/context"

export function LanguageToggle() {
    const { lang, setLang } = useLanguage()

    return (
        <div className="flex items-center gap-0.5 p-1 bg-well border border-rim rounded-xl text-xs font-bold tracking-wider">
            <button
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                    lang === 'en'
                        ? 'bg-panel text-ink shadow-sm'
                        : 'text-mute hover:text-dim'
                }`}
                title="English"
            >
                EN
            </button>
            <button
                onClick={() => setLang('ru')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                    lang === 'ru'
                        ? 'bg-panel text-ink shadow-sm'
                        : 'text-mute hover:text-dim'
                }`}
                title="Русский"
            >
                RU
            </button>
        </div>
    )
}
