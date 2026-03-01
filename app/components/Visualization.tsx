"use client"

import React, { useState, useEffect, useRef } from 'react'

interface Point {
    x: number
    y: number
}

interface Agent {
    id: string
    name: string
    status: 'idle' | 'active' | 'thinking' | 'blocked' | 'error'
    pos: Point
    targetPos?: Point
    carryingId?: string // ID of the WorkUnit being carried
    color: string       // Base color for the colonist
    bob: number         // Animation offset
}

interface WorkUnit {
    id: string
    agentId?: string    // If being carried
    stationId?: string  // If being processed
    type: 'container' | 'crystal' | 'doc'
    pos: Point
    targetPos?: Point
    status: 'pending' | 'in_progress' | 'blocked' | 'done'
    progress: number    // 0 to 100
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
    theme?: 'dark' | 'light'
}

type StationType = 'inbox' | 'processing' | 'validation' | 'output' | 'storage'

const STATION_TYPES: Record<VisualizationActivityInput['station'], StationType> = {
    chat: 'inbox',
    tasks: 'processing',
    tools: 'processing',
    browser: 'output',
    db: 'storage',
    cron: 'processing',
    system: 'validation',
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

// Agent Trait Library for cosmetic variety
const AGENT_TRAITS: Record<string, { hair: string, hairColor: string }> = {
    'default': { hair: 'w-4 h-1', hairColor: '#1e293b' },
    '0': { hair: 'w-4 h-2 rounded-t-full', hairColor: '#451a03' }, // Brown bob
    '1': { hair: 'w-5 h-2 rounded-t-lg -top-0.5', hairColor: '#78350f' }, // Hat-like
    '2': { hair: 'w-3 h-3 rounded-full', hairColor: '#0f172a' }, // Spiky/Short
    '3': { hair: 'w-4 h-1.5 rounded-sm', hairColor: '#4b5563' }, // Grey
    '4': { hair: 'w-2 h-4 rounded-full -right-1', hairColor: '#92400e' }, // Side ponytail-ish
}

const getAgentTraits = (id: string) => {
    const hash = id.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0)
    const index = Math.abs(hash) % 5
    return AGENT_TRAITS[index.toString()] || AGENT_TRAITS.default
}

export const Visualization: React.FC<VisualizationProps> = ({ agents: inputAgents, activities = [], logicLoad }) => {
    const [zoom, setZoom] = useState(1)
    const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
    const containerRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 })

    const [agents, setAgents] = useState<Agent[]>([])
    const [workUnits, setWorkUnits] = useState<WorkUnit[]>([])
    const [activeStations, setActiveStations] = useState<Set<string>>(new Set())

    const AGENT_COLORS = ['#60a5fa', '#34d399', '#f87171', '#fbbf24', '#c084fc', '#818cf8', '#22d3ee']

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

                // Keep current state if agent already exists
                const existing = prev.find(p => p.id === a.id)
                return {
                    id: a.id,
                    name: a.name,
                    status: a.status as any,
                    pos: existing ? existing.pos : defaultPos,
                    targetPos,
                    color: existing ? existing.color : AGENT_COLORS[idx % AGENT_COLORS.length],
                    bob: existing ? existing.bob : 0,
                    carryingId: existing?.carryingId
                }
            })
        })
    }, [JSON.stringify(inputAgents), JSON.stringify(activities)])

    // Manage Work Units based on activities
    useEffect(() => {
        setWorkUnits(prev => {
            const next = [...prev]
            activities.forEach(act => {
                const agent = agents.find(a => a.id === act.agentId)
                if (!agent) return

                const existingUnit = next.find(u => u.agentId === act.agentId && u.status !== 'done')
                if (!existingUnit) {
                    // Spawn new work unit at agent's position
                    next.push({
                        id: `wu-${act.agentId}-${Date.now()}`,
                        agentId: act.agentId,
                        type: act.station === 'db' || act.station === 'system' ? 'crystal' : act.station === 'tasks' || act.station === 'chat' ? 'doc' : 'container',
                        pos: { ...agent.pos },
                        status: 'in_progress',
                        progress: 0
                    })
                }
            })
            return next
        })
    }, [JSON.stringify(activities)])

    // Move agents smoothly toward their target stations
    useEffect(() => {
        const interval = setInterval(() => {
            // Update Agents
            setAgents(prev => prev.map(a => {
                const target = a.targetPos || a.pos
                const dx = target.x - a.pos.x
                const dy = target.y - a.pos.y
                const dist = Math.sqrt(dx * dx + dy * dy)

                let nextPos = a.pos
                const isMoving = dist > 4

                if (isMoving) {
                    const moveSpeed = 4
                    nextPos = {
                        x: a.pos.x + (dx / dist) * moveSpeed,
                        y: a.pos.y + (dy / dist) * moveSpeed
                    }
                } else {
                    nextPos = target
                }

                // Procedural bobbing
                const bobSpeed = isMoving ? 0.2 : 0.1
                const nextBob = a.bob + bobSpeed

                return {
                    ...a,
                    pos: nextPos,
                    bob: nextBob
                }
            }))

            // Update Work Units
            setWorkUnits(prev => prev.map(u => {
                if (u.status === 'done') return u

                const agent = agents.find(a => a.id === u.agentId)
                if (agent) {
                    // Carry with agent
                    return { ...u, pos: { x: agent.pos.x + 10, y: agent.pos.y - 10 }, progress: Math.min(100, u.progress + 0.5) }
                }

                // If no agent, it might be at a station
                const activity = activities.find(act => act.agentId === u.agentId)
                if (!activity && u.progress >= 100) {
                    return { ...u, status: 'done' as const }
                }

                return u
            }).filter(u => u.status !== 'done' || u.progress < 105)) // Keep done for a bit for animation
        }, 32)
        return () => clearInterval(interval)
    }, [agents, activities])

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
            {/* Colony Floor Grid */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.03]"
                style={{
                    backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
                    backgroundSize: `${80 * zoom}px ${80 * zoom}px`,
                    backgroundPosition: `${offset.x}px ${offset.y}px`
                }}
            />
            {/* Fine Grid */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.05]"
                style={{
                    backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
                    backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
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
                    const activeWorkers = activities.filter(act => act.station === key)
                    const isActive = activeWorkers.length > 0
                    const isBottleneck = activeWorkers.length > 2
                    const color = STATION_COLORS[key as keyof typeof STATIONS]
                    const label = STATION_LABEL[key as keyof typeof STATIONS]
                    const type = STATION_TYPES[key as keyof typeof STATIONS]

                    return (
                        <div key={key} className="absolute" style={{ left: pos.x - 50, top: pos.y - 50 }}>
                            {/* Station Plate */}
                            <div className={`relative w-[100px] h-[100px] rounded-xl border-2 transition-all duration-500 overflow-hidden flex flex-col items-center justify-center
                                ${isActive
                                    ? isBottleneck
                                        ? `bg-amber-950/20 border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.3)]`
                                        : `bg-slate-900 border-${color}-500/50 shadow-[0_0_20px_rgba(var(--${color}-500-rgb),0.2)]`
                                    : 'bg-slate-950/40 border-white/5 opacity-40'}`}>

                                {/* Background Pattern */}
                                <div className="absolute inset-0 opacity-10 pointer-events-none"
                                    style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '10px 10px' }} />

                                {/* Icon/Label Area */}
                                <div className={`mb-1 font-black text-[9px] tracking-tighter ${isActive ? `text-${color}-400` : 'text-slate-700'}`}>
                                    {label}
                                </div>

                                {/* Machine Body Rendering (CSS simplified) */}
                                <div className={`relative w-12 h-10 border rounded-sm flex items-center justify-center transition-colors
                                    ${isActive ? `bg-${color}-500/10 border-${color}-500/30` : 'bg-white/5 border-white/10'}`}>
                                    <div className={`w-6 h-6 rounded-full border-2 border-dashed ${isActive ? `border-${color}-500/40 animate-[spin_4s_linear_infinite]` : 'border-white/5'}`} />
                                    {isActive && <div className={`absolute -top-1 -right-1 w-2 h-2 rounded-full bg-${color}-500 animate-pulse`} />}
                                </div>

                                {/* Progress Bar */}
                                {isActive && (
                                    <div className="mt-2 w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div className={`h-full bg-${color}-500 animate-[pulse_1s_infinite]`} style={{ width: '60%' }} />
                                    </div>
                                )}

                                {/* Station Tooltip */}
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-0 hover:opacity-100 transition-opacity bg-slate-900/95 p-2 rounded-lg border border-white/10 shadow-2xl z-[100] min-w-[80px] pointer-events-none">
                                    <div className="text-[8px] text-slate-500 uppercase font-bold">{type}</div>
                                    <div className="text-[10px] text-white font-black">{label}</div>
                                    <div className="flex items-center gap-1 mt-1">
                                        <div className={`w-1 h-1 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-700'}`} />
                                        <span className="text-[8px] text-slate-400">{isActive ? 'OPERATIONAL' : 'IDLE'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Queue Indicator */}
                            <div className="absolute -right-4 top-0 flex flex-col gap-1">
                                {workUnits.filter(u => u.stationId === key && u.status === 'blocked').map((_, i) => (
                                    <div key={i} className={`w-3 h-3 bg-${color}-500/40 rounded-sm border border-${color}-400/20`} />
                                ))}
                            </div>
                        </div>
                    )
                })}

                {/* Connection Beams (Data Pipelines) */}
                <svg className="absolute inset-0 w-[2000px] h-[2000px] pointer-events-none overflow-visible">
                    {agents.map(agent => {
                        const activity = activities.find(act => act.agentId === agent.id)
                        if (!activity) return null
                        const stationPos = STATIONS[activity.station]
                        if (!stationPos) return null

                        const color = STATION_COLORS[activity.station]
                        const strokeColor = {
                            blue: '#3b82f6',
                            emerald: '#10b981',
                            indigo: '#6366f1',
                            cyan: '#06b6d4',
                            amber: '#f59e0b',
                            purple: '#a855f7',
                            slate: '#64748b'
                        }[color] || '#60a5fa'

                        return (
                            <React.Fragment key={`beam-${agent.id}`}>
                                {/* Main Route (Glow) */}
                                <line
                                    x1={agent.pos.x + 24} y1={agent.pos.y + 28}
                                    x2={stationPos.x} y2={stationPos.y}
                                    stroke={strokeColor}
                                    strokeWidth="4"
                                    className="opacity-10"
                                />
                                {/* Pulsing Data Line */}
                                <line
                                    x1={agent.pos.x + 24} y1={agent.pos.y + 28}
                                    x2={stationPos.x} y2={stationPos.y}
                                    stroke={strokeColor}
                                    strokeWidth="1"
                                    strokeDasharray="8 12"
                                    className="opacity-60"
                                >
                                    <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1s" repeatCount="indefinite" />
                                </line>
                            </React.Fragment>
                        )
                    })}
                </svg>

                {/* Work Units Rendering */}
                {workUnits.map(unit => {
                    const color = unit.type === 'crystal' ? '#06b6d4' : unit.type === 'doc' ? '#fbbf24' : '#60a5fa'
                    return (
                        <div
                            key={unit.id}
                            className={`absolute z-[60] transition-colors duration-200 ${unit.status === 'done' ? 'animate-ping' : ''}`}
                            style={{
                                left: unit.pos.x,
                                top: unit.pos.y,
                                transform: `scale(${unit.status === 'done' ? 0 : 1})`,
                                transition: 'all 0.1s linear'
                            }}
                        >
                            {/* Done animation */}
                            {unit.status === 'done' && (
                                <div className="absolute inset-0 bg-white rounded-full animate-ping opacity-50" />
                            )}

                            <div className="w-4 h-4 rounded-sm shadow-lg border border-white/20 flex items-center justify-center group/wu relative"
                                style={{ backgroundColor: color }}>
                                {unit.type === 'crystal' && <div className="w-1.5 h-1.5 bg-white/60 rotate-45" />}
                                {unit.type === 'doc' && <div className="w-2 h-[2px] bg-white/60" />}

                                {/* WorkUnit Tooltip */}
                                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 opacity-0 group-hover/wu:opacity-100 transition-opacity bg-black/90 text-[8px] px-2 py-1 rounded border border-white/10 whitespace-nowrap pointer-events-none z-[100]">
                                    {unit.type.toUpperCase()} UNIT: {Math.round(unit.progress)}%
                                </div>
                            </div>
                        </div>
                    )
                })}

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

                        {/* Agent Body (Colonist Style) */}
                        <div className="relative group/agent">
                            {/* Shadow/Ring */}
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-2 bg-black/40 rounded-full blur-[2px]" />
                            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-6 -translate-y-2 rounded-full border border-white/5 bg-white/5 opacity-40"
                                style={{ borderColor: agent.color }} />

                            {/* LOD: Simple dot if zoomed out */}
                            {zoom < 0.6 ? (
                                <div className="w-4 h-4 rounded-full border border-white/20 shadow-lg" style={{ backgroundColor: agent.color }} />
                            ) : (
                                <div style={{ transform: `translateY(${Math.sin(agent.bob) * 1.5}px)` }}>
                                    {/* Body */}
                                    <div className="w-6 h-6 rounded-lg shadow-inner relative z-10"
                                        style={{ backgroundColor: agent.color }}>
                                        <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-black/20 rounded-lg" />

                                        {/* Action items/Carry indicator */}
                                        {activities.some(act => act.agentId === agent.id) && (
                                            <div className="absolute -right-1 -top-1 w-2.5 h-2.5 bg-white rounded-full flex items-center justify-center border border-black/20 animate-pulse">
                                                <div className="w-1 h-1 bg-slate-900 rounded-full" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Head */}
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-4.5 h-4.5 rounded-md bg-[#ffe0bd] shadow-md z-20 border-[0.5px] border-black/10">
                                        {/* Minimal Eyes */}
                                        <div className="absolute top-1.5 left-1 right-1 flex justify-between px-0.5">
                                            <div className="w-0.5 h-0.5 bg-slate-900 rounded-full" />
                                            <div className="w-0.5 h-0.5 bg-slate-900 rounded-full" />
                                        </div>
                                        {/* Procedural Hair/Hat */}
                                        {(() => {
                                            const traits = getAgentTraits(agent.id)
                                            return <div className={`absolute -top-1 left-1/2 -translate-x-1/2 ${traits.hair} z-30`} style={{ backgroundColor: traits.hairColor }} />
                                        })()}
                                    </div>
                                </div>
                            )}

                            {/* Status Indicator (Bubbles) */}
                            {agent.status === 'thinking' && (
                                <div className="absolute -right-6 top-0 flex gap-0.5 animate-bounce">
                                    <div className="w-1 h-1 bg-amber-400 rounded-full" />
                                    <div className="w-1 h-1 bg-amber-400 rounded-full delay-100" />
                                    <div className="w-1 h-1 bg-amber-400 rounded-full delay-200" />
                                </div>
                            )}
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
