import "./globals.css"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { LanguageProvider } from "./i18n/context"
import { Header } from "./components/Header"
import { AuthGate } from "./components/AuthGate"

const inter = Inter({
    subsets: ["latin", "cyrillic"],
    display: "swap",
    weight: ["400", "500", "600", "700", "800", "900"],
})

export const metadata: Metadata = {
    title: "OpenClwList",
    description: "Operational monitor UI for OpenClaw Gateway",
    icons: { icon: "/favicon.png" },
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){var t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);})();`,
                    }}
                />
            </head>
            <body className={`${inter.className} antialiased bg-surface text-ink min-h-screen pt-20`}>
                <LanguageProvider>
                    <AuthGate>
                        <Header />
                        {children}
                    </AuthGate>
                </LanguageProvider>
            </body>
        </html>
    )
}
