"use client"

import React from 'react'
import { Visualization } from '../components/Visualization'
import { Bot, Home, Settings, Activity, ArrowLeft } from 'lucide-react'
import { useLanguage } from '../i18n/context'

export default function SimulationPage() {
    const { t } = useLanguage()

    return (
        <div className="min-h-screen bg-[#0d1017] text-gray-200 p-6 flex flex-col gap-6">
            <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 border-b border-white/5 pb-6">
                <div className="flex items-center gap-4">
                    <a href="/" className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </a>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            <Activity className="w-5 h-5 text-blue-500" />
                            Agent Simulation Hub
                        </h1>
                        <p className="text-xs text-gray-500">Real-time tycoon-style agent monitor</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 mt-4 md:mt-0">
                    <div className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-500 rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse">
                        Live Gateway Stream
                    </div>
                </div>
            </header>

            <main className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Sidebar / Stats */}
                <div className="lg:col-span-1 flex flex-col gap-4">
                    <div className="bg-panel border border-rim p-4 rounded-2xl">
                        <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                            <Bot className="w-4 h-4" /> Active Agents
                        </h2>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between p-2 bg-well rounded-xl border border-rim">
                                <span className="text-xs">Agent Alpha</span>
                                <span className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">Idle</span>
                            </div>
                            <div className="flex items-center justify-between p-2 bg-well rounded-xl border border-rim">
                                <span className="text-xs">Agent Beta</span>
                                <span className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full">Thinking</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-panel border border-rim p-4 rounded-2xl flex-1">
                        <h2 className="text-sm font-bold mb-3">Recent Activities</h2>
                        <div className="text-[10px] space-y-2 font-mono text-gray-500">
                            <div>[10:45] Alpha moved to Workspace A</div>
                            <div>[10:46] Beta started core-process</div>
                            <div className="text-blue-400">[10:47] New Task: Log Audit</div>
                        </div>
                    </div>
                </div>

                {/* Main Simulation View */}
                <div className="lg:col-span-3">
                    <Visualization />
                </div>
            </main>

            <footer className="text-center text-[10px] text-gray-600 uppercase tracking-[0.2em] py-4 border-t border-white/5">
                Powered by OpenClaw Gateway • Tycoon Visualization v0.1
            </footer>
        </div>
    )
}
