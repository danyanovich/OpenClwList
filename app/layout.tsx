import "./globals.css"
import type { Metadata } from "next"
import { LanguageProvider } from "./i18n/context"
import { Header } from "./components/Header"
import { GatewayProvider } from "./contexts/GatewayContext"
import { GatewayGate } from "./components/ConnectionSetup"

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
            <body className="antialiased bg-surface text-ink min-h-screen font-[Inter] pt-20">
                <LanguageProvider>
                    <GatewayProvider>
                        <GatewayGate>
                            <Header />
                            {children}
                        </GatewayGate>
                    </GatewayProvider>
                </LanguageProvider>
            </body>
        </html>
    )
}
