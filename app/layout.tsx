import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "ClawProject Ops UI",
    description: "Operational monitor UI for OpenClaw Gateway",
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <body className="antialiased bg-[#0e0e11] text-gray-100 min-h-screen">
                {children}
            </body>
        </html>
    )
}
