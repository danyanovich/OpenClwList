"use client"

import React, { useState, useEffect, useRef } from 'react'

interface Point {
    x: number
    y: number
}

interface Agent {
    id: string
    name: string
    status: 'idle' | 'active' | 'thinking'
    pos: Point
    targetPos?: Point
}

export type VisualizationAgentInput = {
    id: string
    name: string
    status: 'idle' | 'active' | 'thinking'
}

export type VisualizationActivityInput = {
    agentId: string
    station: 'chat' | 'tasks' | 'tools' | 'browser' | 'db' | 'cron' | 'system'
    lastLabel?: string
}

interface VisualizationProps {
    agents: VisualizationAgentInput[]
    activities?: VisualizationActivityInput[]
    logicLoad?: number
}

// Fixed station coordinates in world space
const STATIONS: Record<VisualizationActivityInput['station'], Point> = {
    chat: { x: 140, y: 320 },      // Chat hub
    tasks: { x: 420, y: 320 },     // Tasks & runs
    tools: { x: 280, y: 180 },     // Tools & integrations
    browser: { x: 560, y: 180 },   // Browser relay
    db: { x: 560, y: 420 },        // Storage / DB
    cron: { x: 420, y: 80 },       // Cron / schedules
    system: { x: 140, y: 80 },     // System / diagnostics
}

const STATION_LABEL: Record<VisualizationActivityInput['station'], string> = {
    chat: 'CHAT',
    tasks: 'TASKS',
    tools: 'TOOLS',
    browser: 'BROWSER',
    db: 'DB',
    cron: 'CRON',
    system: 'SYSTEM',
}

const STATION_BADGE_CLASS: Record<VisualizationActivityInput['station'], string> = {
    chat: 'bg-blue-500/20 text-blue-300',
    tasks: 'bg-emerald-500/20 text-emerald-300',
    tools: 'bg-indigo-500/20 text-indigo-300',
    browser: 'bg-cyan-500/20 text-cyan-300',
    db: 'bg-amber-500/20 text-amber-300',
    cron: 'bg-purple-500/20 text-purple-300',
    system: 'bg-slate-500/30 text-slate-200',
}

export const Visualization: React.FC<VisualizationProps> = ({ agents: inputAgents, activities = [] }) => {
    const [zoom, setZoom] = useState(1)
    const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
    const containerRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 })

    const [agents, setAgents] = useState<Agent[]>([])

    // lay out incoming agents and align their targets to activity stations
    useEffect(() => {
        const baseX = 120
        const baseY = 140
        const gapX = 220
        const gapY = 160

        const activityByAgent = activities.reduce<Record<string, VisualizationActivityInput>>((acc, act) => {
            acc[act.agentId] = act
            return acc
        }, {})

        const next: Agent[] = inputAgents.map((a, idx) => {
            const row = Math.floor(idx / 3)
            const col = idx % 3
            const defaultPos: Point = {
                x: baseX + col * gapX,
                y: baseY + row * gapY,
            }
            const activity = activityByAgent[a.id]
            const station = activity?.station
            const targetPos = station ? STATIONS[station] : defaultPos
            return {
                id: a.id,
                name: a.name,
                status: a.status,
                pos: defaultPos,
                targetPos,
            }
        })
        setAgents(next)
    }, [JSON.stringify(inputAgents), JSON.stringify(activities)])

    // Move agents smoothly toward their target stations
    useEffect(() => {
        const interval = setInterval(() => {
            setAgents(prev => prev.map(a => {
                const target = a.targetPos || a.pos
                const dx = target.x - a.pos.x
                const dy = target.y - a.pos.y
                const dist = Math.sqrt(dx * dx + dy * dy)

                if (dist < 4) {
                    // Snap to target when close enough
                    return { ...a, pos: target }
                }

                const moveSpeed = 2.2
                return {
                    ...a,
                    pos: {
                        x: a.pos.x + (dx / dist) * moveSpeed,
                        y: a.pos.y + (dy / dist) * moveSpeed
                    }
                }
            }))
        }, 50)
        return () => clearInterval(interval)
    }, [])

    const onMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true)
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
    }

    const onMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return
        setOffset({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        })
    }

    const onMouseUp = () => setIsDragging(false)

    return (
        <div
            ref={containerRef}
            className={`relative w-full h-[650px] bg-[#090b10] overflow-hidden border border-white/5 rounded-3xl shadow-2xl ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={(e) => {
                const scaleFactor = 0.05
                const newZoom = e.deltaY > 0 ? zoom - scaleFactor : zoom + scaleFactor
                setZoom(Math.max(0.3, Math.min(3, newZoom)))
            }}
        >
            {/* Grid Pattern */}
            <div
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundImage: `linear-gradient(#222 1px, transparent 1px), linear-gradient(90deg, #222 1px, transparent 1px)`,
                    backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
                    backgroundPosition: `${offset.x}px ${offset.y}px`
                }}
            />

            {/* World View */}
            <div
                className="absolute top-0 left-0 transition-transform duration-75 ease-out"
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
            >
                {/* Environment Objects */}
                <div className="absolute top-[120px] left-[160px] w-48 h-32 bg-[#1a1f2e] border-4 border-[#2d3748] rounded-xl flex items-center justify-center shadow-lg">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#2d3748] px-3 py-1 rounded text-[10px] font-bold text-blue-400 border border-blue-500/20">
                        COMPUTE CLUSTER
                    </div>
                    <div className="grid grid-cols-4 gap-1 p-2">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className={`w-3 h-3 rounded-full ${Math.random() > 0.3 ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                        ))}
                    </div>
                </div>

                <div className="absolute top-[350px] left-[500px] w-40 h-24 bg-[#1a1f2e] border-4 border-[#2d3748] rounded-xl flex items-center justify-center shadow-lg">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#2d3748] px-3 py-1 rounded text-[10px] font-bold text-amber-400 border border-amber-500/20">
                        DATABASE NODE
                    </div>
                    <div className="w-full h-2 bg-blue-500/10 mx-4 rounded-full overflow-hidden">
                        <div className="w-1/2 h-full bg-blue-500 animate-pulse" />
                    </div>
                </div>

                {/* Agents */}
                {agents.map(agent => (
                    <div
                        key={agent.id}
                        className="absolute z-50 flex flex-col items-center group"
                        style={{ left: agent.pos.x, top: agent.pos.y, transition: 'all 0.05s linear' }}
                    >
                        {/* Status Indicator */}
                        <div className="absolute -top-14 opacity-0 group-hover:opacity-100 transition-opacity bg-black/90 text-[10px] px-3 py-1.5 rounded-md border border-white/10 whitespace-nowrap z-50 shadow-lg flex flex-col items-start gap-0.5">
                            <div className="font-bold tracking-wide text-gray-100 flex items-center gap-2">
                                <span>{agent.status.toUpperCase()}</span>
                                {activities && activities.length > 0 && (() => {
                                    const act = activities.find(a => a.agentId === agent.id)
                                    if (!act) return null
                                    const badge = STATION_BADGE_CLASS[act.station]
                                    const label = STATION_LABEL[act.station]
                                    return (
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${badge}`}>
                                            {label}
                                        </span>
                                    )
                                })()}
                            </div>
                            {activities && activities.length > 0 && (() => {
                                const act = activities.find(a => a.agentId === agent.id)
                                if (!act?.lastLabel) return null
                                return (
                                    <div className="text-[9px] text-gray-400 max-w-xs truncate">
                                        {act.lastLabel}
                                    </div>
                                )
                            })()}
                        </div>

                        {/* Agent "Pixel" Body - more detailed, Stardew-like */}
                        <div className={`relative w-12 h-14 shadow-2xl transition-transform duration-200 ${agent.status === 'thinking' ? 'animate-[pulse_1.2s_ease-in-out_infinite] scale-105' : ''}`}>
                            {/* Body */}
                            <div className={`relative w-12 h-12 rounded-[6px] border-2 border-black/70 overflow-hidden
                                ${agent.status === 'active'
                                    ? 'bg-gradient-to-b from-indigo-400 to-indigo-700'
                                    : agent.status === 'thinking'
                                        ? 'bg-gradient-to-b from-amber-300 to-amber-600'
                                        : 'bg-gradient-to-b from-emerald-300 to-emerald-600'
                                }`}
                            >
                                {/* Face shading */}
                                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/30" />

                                {/* Eyes */}
                                <div className="absolute top-3 left-2 right-2 flex justify-between">
                                    <div className="w-3 h-3 bg-black/70 rounded-[2px] flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 bg-white/80 rounded-sm translate-x-[0.5px] -translate-y-[0.5px]" />
                                    </div>
                                    <div className="w-3 h-3 bg-black/70 rounded-[2px] flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 bg-white/80 rounded-sm translate-x-[0.5px] -translate-y-[0.5px]" />
                                    </div>
                                </div>

                                {/* Mouth */}
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-6 h-1.5 rounded-full bg-black/40" />

                                {/* Status dots on chest */}
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className={
                                                'w-1.5 h-1.5 rounded-full ' +
                                                (agent.status === 'thinking'
                                                    ? 'bg-amber-200 animate-[bounce_1s_infinite]'
                                                    : agent.status === 'active'
                                                        ? 'bg-emerald-200'
                                                        : 'bg-slate-200/70')
                                            }
                                            style={agent.status === 'thinking' ? { animationDelay: `${i * 0.15}s` } : {}}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Simple feet shadow */}
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1.5 bg-black/40 rounded-full opacity-60" />
                        </div>

                        {/* Nameplate */}
                        <div className="mt-2 bg-black/60 backdrop-blur-md border border-white/10 px-2 py-0.5 rounded-full text-[9px] font-bold text-white/80 font-mono shadow-lg">
                            {agent.name}
                        </div>
                    </div>
                ))}
            </div>

            {/* Interface Overlay */}
            <div className="absolute top-6 left-6 flex flex-col gap-2">
                <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-3 rounded-2xl">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">Total Logic Load</div>
                    <div className="text-xl font-mono text-blue-400">{typeof logicLoad === 'number' ? `${Math.round(logicLoad)}%` : '—'}</div>
                </div>

                {/* Station Legend */}
                <div className="bg-black/70 backdrop-blur-xl border border-white/10 p-3 rounded-2xl mt-1 min-w-[190px]">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-2">Stations</div>
                    <div className="space-y-1.5 text-[10px] text-gray-300">
                        <div className="flex items-center justify-between">
                            <span>CHAT</span>
                            <span className="text-gray-500">User / Agent chat</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>TASKS</span>
                            <span className="text-gray-500">Tasks &amp; runs</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>TOOLS</span>
                            <span className="text-gray-500">Tools &amp; integrations</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>BROWSER</span>
                            <span className="text-gray-500">Browser relay</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>DB</span>
                            <span className="text-gray-500">Storage / DB</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>CRON</span>
                            <span className="text-gray-500">Schedules</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>SYSTEM</span>
                            <span className="text-gray-500">Diagnostics</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex bg-black/40 backdrop-blur-2xl border border-white/5 p-1.5 rounded-2xl shadow-2xl">
                {(() => {
                    const load = typeof logicLoad === 'number' ? logicLoad : 0
                    let dot = 'bg-green-500'
                    let label = 'Stable'
                    let text = 'text-gray-400'
                    if (load >= 70) {
                        dot = 'bg-red-500'
                        label = 'Hot'
                        text = 'text-red-300'
                    } else if (load >= 40) {
                        dot = 'bg-amber-500'
                        label = 'Busy'
                        text = 'text-amber-300'
                    }
                    return (
                        <div className="flex items-center gap-1 px-3 border-r border-white/10 mr-2">
                            <div className={`w-2 h-2 rounded-full ${dot} animate-pulse`} />
                            <span className={`text-[10px] uppercase font-bold ${text}`}>{label}</span>
                        </div>
                    )
                })()}
                <div className="flex gap-1">
                    <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-white">+</button>
                    <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-white">-</button>
                    <button onClick={() => setOffset({ x: 0, y: 0 })} className="px-3 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-[10px] font-bold text-gray-400">RESET VIEW</button>
                </div>
            </div>
        </div>
    )
}
