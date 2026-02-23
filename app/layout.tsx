import "./globals.css"
import type { Metadata } from "next"
import { LanguageProvider } from "./i18n/context"

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
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){var t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);})();`,
                    }}
                />
            </head>
            <body className="antialiased bg-surface text-ink min-h-screen font-[Inter]">
                <LanguageProvider>
                    {children}
                </LanguageProvider>
            </body>
        </html>
    )
}
