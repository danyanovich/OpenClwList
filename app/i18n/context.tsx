"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { translations, Lang, TranslationKey } from "./translations"

type LanguageContextValue = {
    lang: Lang
    setLang: (l: Lang) => void
    t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue>({
    lang: 'en',
    setLang: () => {},
    t: (key) => translations.en[key] ?? key,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Lang>('en')

    useEffect(() => {
        const stored = localStorage.getItem('lang') as Lang | null
        if (stored === 'en' || stored === 'ru') setLangState(stored)
    }, [])

    const setLang = (l: Lang) => {
        setLangState(l)
        localStorage.setItem('lang', l)
    }

    const t = (key: TranslationKey): string =>
        (translations[lang] as Record<string, string>)[key] ??
        (translations.en as Record<string, string>)[key] ??
        key

    return (
        <LanguageContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LanguageContext.Provider>
    )
}

export const useLanguage = () => useContext(LanguageContext)
