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

export const Visualization: React.FC = () => {
    const [zoom, setZoom] = useState(1)
    const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
    const containerRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 })

    // Current session states from API would go here
    const [agents, setAgents] = useState<Agent[]>([
        { id: '1', name: 'Agent Alpha', status: 'active', pos: { x: 150, y: 150 } },
        { id: '2', name: 'Agent Beta', status: 'thinking', pos: { x: 450, y: 250 } },
        { id: '3', name: 'Agent Gamma', status: 'idle', pos: { x: 100, y: 400 } },
    ])

    // Move targets for "Walking" effect
    const [targets, setTargets] = useState<Record<string, Point>>({})

    useEffect(() => {
        const interval = setInterval(() => {
            setAgents(prev => prev.map(a => {
                const target = targets[a.id] || a.pos
                const dx = target.x - a.pos.x
                const dy = target.y - a.pos.y
                const dist = Math.sqrt(dx * dx + dy * dy)

                if (dist < 5) {
                    // Reached target, pick new one if idle
                    if (a.status === 'idle') {
                        setTargets(prevT => ({
                            ...prevT,
                            [a.id]: { x: Math.random() * 800, y: Math.random() * 600 }
                        }))
                    } else if (a.status === 'active') {
                        // Active agents stay at workstations (Server Rack placeholders for now)
                        setTargets(prevT => ({ ...prevT, [a.id]: { x: 200, y: 150 } }))
                    }
                    return a
                }

                const moveSpeed = 2
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
    }, [targets])

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
                        <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-[10px] px-2 py-1 rounded-md border border-white/10 whitespace-nowrap z-50">
                            {agent.status.toUpperCase()}
                        </div>

                        {/* Agent "Pixel" Body */}
                        <div className={`relative w-10 h-10 shadow-2xl transition-transform duration-200 ${agent.status === 'thinking' ? 'animate-pulse scale-110' : ''}`}>
                            {/* Pixel Art Style Body */}
                            <div className={`w-10 h-10 rounded-lg border-2 border-black/50 ${agent.status === 'active' ? 'bg-indigo-500' :
                                    agent.status === 'thinking' ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}>
                                <div className="absolute top-2 left-2 w-2 h-2 bg-black/30 rounded-full" />
                                <div className="absolute top-2 right-2 w-2 h-2 bg-black/30 rounded-full" />
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-4 h-1 bg-black/20 rounded-full" />
                            </div>

                            {/* Activity Particles for Thinking */}
                            {agent.status === 'thinking' && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex gap-1">
                                    <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                    <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                    <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" />
                                </div>
                            )}
                        </div>

                        {/* Nameplate */}
                        <div className="mt-2 bg-black/40 backdrop-blur-md border border-white/5 px-2 py-0.5 rounded-full text-[9px] font-bold text-white/80 font-mono shadow-lg">
                            {agent.name}
                        </div>
                    </div>
                ))}
            </div>

            {/* Interface Overlay */}
            <div className="absolute top-6 left-6 flex flex-col gap-2">
                <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-3 rounded-2xl">
                    <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">Total Logic Load</div>
                    <div className="text-xl font-mono text-blue-400">84%</div>
                </div>
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex bg-black/40 backdrop-blur-2xl border border-white/5 p-1.5 rounded-2xl shadow-2xl">
                <div className="flex items-center gap-1 px-3 border-r border-white/10 mr-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] uppercase font-bold text-gray-400">Stable</span>
                </div>
                <div className="flex gap-1">
                    <button onClick={() => setZoom(z => Math.min(3, z + 0.2))} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-white">+</button>
                    <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-white">-</button>
                    <button onClick={() => setOffset({ x: 0, y: 0 })} className="px-3 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-[10px] font-bold text-gray-400">RESET VIEW</button>
                </div>
            </div>
        </div>
    )
}
