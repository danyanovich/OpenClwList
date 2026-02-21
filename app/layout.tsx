import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "ClawProject Ops UI",
    description: "Operational monitor UI for OpenClaw Gateway",
    icons: { icon: "/favicon.png" },
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <head>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
            </head>
            <body className="antialiased bg-[#0e0e11] text-gray-100 min-h-screen font-[Inter]">
                {children}
            </body>
        </html>
    )
}
