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

const STATION_COLORS: Record<VisualizationActivityInput['station'], string> = {
    chat: 'blue',
    tasks: 'emerald',
    tools: 'indigo',
    browser: 'cyan',
    db: 'amber',
    cron: 'purple',
    system: 'slate',
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

export const Visualization: React.FC<VisualizationProps> = ({ agents: inputAgents, activities = [], logicLoad }) => {
    const [zoom, setZoom] = useState(1)
    const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
    const containerRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 })

    const [agents, setAgents] = useState<Agent[]>([])
    const [activeStations, setActiveStations] = useState<Set<string>>(new Set())

    // Update active stations based on current activities
    useEffect(() => {
        const active = new Set<string>()
        activities.forEach(act => active.add(act.station))
        setActiveStations(active)
    }, [activities])

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

        setAgents(prev => {
            return inputAgents.map((a, idx) => {
                const row = Math.floor(idx / 3)
                const col = idx % 3
                const defaultPos: Point = {
                    x: baseX + col * gapX,
                    y: baseY + row * gapY,
                }
                const activity = activityByAgent[a.id]
                const station = activity?.station
                const targetPos = station ? STATIONS[station] : defaultPos

                // Keep current pos if agent already exists
                const existing = prev.find(p => p.id === a.id)
                return {
                    id: a.id,
                    name: a.name,
                    status: a.status,
                    pos: existing ? existing.pos : defaultPos,
                    targetPos,
                }
            })
        })
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
                    return { ...a, pos: target }
                }

                const moveSpeed = 4 // slightly faster for better feel
                return {
                    ...a,
                    pos: {
                        x: a.pos.x + (dx / dist) * moveSpeed,
                        y: a.pos.y + (dy / dist) * moveSpeed
                    }
                }
            }))
        }, 32) // ~30fps for smooth motion
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
                {/* Station Nodes */}
                {Object.entries(STATIONS).map(([key, pos]) => {
                    const isActive = activeStations.has(key)
                    const color = STATION_COLORS[key as keyof typeof STATIONS]
                    const label = STATION_LABEL[key as keyof typeof STATIONS]

                    return (
                        <div key={key} className="absolute" style={{ left: pos.x - 40, top: pos.y - 40 }}>
                            <div className={`relative w-20 h-20 rounded-2xl flex items-center justify-center border-2 transition-all duration-300 ${isActive
                                    ? `bg-${color}-500/20 border-${color}-400 shadow-[0_0_30px_rgba(var(--${color}-500-rgb),0.3)]`
                                    : 'bg-white/5 border-white/10 opacity-60'
                                }`}>
                                <div className={`text-[10px] font-black tracking-tighter ${isActive ? `text-${color}-300` : 'text-gray-500'}`}>
                                    {label}
                                </div>
                                {isActive && (
                                    <div className={`absolute -inset-2 border border-${color}-500/50 rounded-3xl animate-ping opacity-20`} />
                                )}
                            </div>
                        </div>
                    )
                })}

                {/* Connection Beams */}
                <svg className="absolute inset-0 w-[2000px] h-[2000px] pointer-events-none overflow-visible">
                    {agents.map(agent => {
                        const activity = activities.find(act => act.agentId === agent.id)
                        if (!activity) return null
                        const stationPos = STATIONS[activity.station]
                        if (!stationPos) return null

                        const color = STATION_COLORS[activity.station]
                        const strokeColor = {
                            blue: '#60a5fa',
                            emerald: '#34d399',
                            indigo: '#818cf8',
                            cyan: '#22d3ee',
                            amber: '#fbbf24',
                            purple: '#c084fc',
                            slate: '#94a3b8'
                        }[color]

                        return (
                            <React.Fragment key={`beam-${agent.id}`}>
                                <line
                                    x1={agent.pos.x + 24} y1={agent.pos.y + 28}
                                    x2={stationPos.x} y2={stationPos.y}
                                    stroke={strokeColor}
                                    strokeWidth="2"
                                    strokeDasharray="4 4"
                                    className="opacity-40"
                                >
                                    <animate attributeName="stroke-dashoffset" from="0" to="20" dur="0.5s" repeatCount="indefinite" />
                                </line>
                            </React.Fragment>
                        )
                    })}
                </svg>

                {/* Agents */}
                {agents.map(agent => (
                    <div
                        key={agent.id}
                        className="absolute z-50 flex flex-col items-center group"
                        style={{ left: agent.pos.x, top: agent.pos.y, transition: 'all 0.03s linear' }}
                    >
                        {/* Action Label (floating above agent) */}
                        {(() => {
                            const act = activities.find(a => a.agentId === agent.id)
                            if (!act?.lastLabel) return null
                            const color = STATION_COLORS[act.station]
                            return (
                                <div className={`absolute -top-12 px-3 py-1 bg-black/80 backdrop-blur-md rounded-lg border border-${color}-500/30 text-[10px] whitespace-nowrap animate-bounce shadow-xl`}>
                                    <span className={`font-mono text-${color}-300`}>{act.lastLabel.substring(0, 30)}...</span>
                                </div>
                            )
                        })()}

                        {/* Status Tooltip (on hover) */}
                        <div className="absolute -top-20 opacity-0 group-hover:opacity-100 transition-opacity bg-black/90 text-[10px] px-3 py-1.5 rounded-md border border-white/10 whitespace-nowrap z-50 shadow-lg flex flex-col items-start gap-0.5">
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
                        </div>

                        {/* Agent Body */}
                        <div className={`relative w-12 h-14 shadow-2xl transition-transform duration-200 ${agent.status === 'thinking' ? 'animate-[pulse_0.8s_ease-in-out_infinite] scale-110' : ''}`}>
                            <div className={`relative w-12 h-12 rounded-[10px] border-2 border-black/70 overflow-hidden
                                ${agent.status === 'active'
                                    ? 'bg-gradient-to-b from-blue-400 to-blue-700'
                                    : agent.status === 'thinking'
                                        ? 'bg-gradient-to-b from-amber-300 to-amber-600'
                                        : 'bg-gradient-to-b from-emerald-300 to-emerald-600'
                                }`}
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/40" />

                                {/* Eyes */}
                                <div className="absolute top-3 left-2 right-2 flex justify-between">
                                    <div className={`w-3.5 h-3.5 bg-black/80 rounded-[3px] flex items-center justify-center ${agent.status === 'thinking' ? 'animate-pulse' : ''}`}>
                                        <div className="w-1.5 h-1.5 bg-white/90 rounded-sm translate-x-[0.5px] -translate-y-[0.5px]" />
                                    </div>
                                    <div className={`w-3.5 h-3.5 bg-black/80 rounded-[3px] flex items-center justify-center ${agent.status === 'thinking' ? 'animate-pulse' : ''}`}>
                                        <div className="w-1.5 h-1.5 bg-white/90 rounded-sm translate-x-[0.5px] -translate-y-[0.5px]" />
                                    </div>
                                </div>

                                {/* Mouth / Action */}
                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-5 h-1.5 rounded-full bg-black/50" />

                                {/* Status lights */}
                                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1">
                                    {isActiveAgent(agent.id, activities) && (
                                        <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                                    )}
                                </div>
                            </div>
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-2 bg-black/60 rounded-full blur-[2px]" />
                        </div>

                        {/* Nameplate */}
                        <div className="mt-2 bg-black/80 backdrop-blur-md border border-white/10 px-3 py-1 rounded-full text-[10px] font-bold text-white shadow-xl">
                            {agent.name}
                        </div>
                    </div>
                ))}
            </div>

            {/* Interface Overlay */}
            <div className="absolute top-6 left-6 flex flex-col gap-2 pointer-events-none">
                <div className="bg-black/80 backdrop-blur-2xl border border-white/10 p-4 rounded-3xl shadow-2xl">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-blue-500 font-black mb-1">Logic Load</div>
                    <div className="text-3xl font-mono text-white flex items-baseline gap-1">
                        {typeof logicLoad === 'number' ? Math.round(logicLoad) : '0'}
                        <span className="text-sm text-gray-500">%</span>
                    </div>
                    <div className="w-full h-1 bg-white/10 mt-3 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 transition-all duration-1000 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                            style={{ width: `${logicLoad || 0}%` }}
                        />
                    </div>
                </div>

                {/* Station Status Legend */}
                <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-4 rounded-3xl mt-2 min-w-[200px]">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-3">Live Systems</div>
                    <div className="space-y-2">
                        {Object.keys(STATIONS).map(s => (
                            <div key={s} className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${activeStations.has(s) ? `bg-${STATION_COLORS[s as keyof typeof STATIONS]}-400 animate-pulse` : 'bg-white/10'}`} />
                                <span className={`text-[10px] font-bold uppercase ${activeStations.has(s) ? 'text-white' : 'text-gray-600'}`}>{s}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center bg-black/80 backdrop-blur-2xl border border-white/10 p-2 rounded-2xl shadow-2xl">
                <div className="flex gap-1">
                    <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white font-bold text-xl">+</button>
                    <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white font-bold text-xl">-</button>
                    <div className="w-px h-6 bg-white/10 mx-2 self-center" />
                    <button onClick={() => { setOffset({ x: 0, y: 0 }); setZoom(1); }} className="px-4 py-2 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-all text-[11px] font-black tracking-widest text-gray-400">RESET CORE</button>
                </div>
            </div>
        </div>
    )
}

function isActiveAgent(agentId: string, activities: VisualizationActivityInput[]) {
    return activities.some(a => a.agentId === agentId)
}
