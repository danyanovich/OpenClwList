"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { Plus, CheckCircle, Circle, Activity, Clock, Trash2, Edit2, Bot, Info, Shield, AlertCircle, X, AlignLeft, Loader2, ListTodo, Pencil, Search, Wifi, WifiOff } from "lucide-react"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useLanguage } from "../i18n/context"
import { useGateway } from "../contexts/GatewayContext"
import {
    createTask as createTaskStore,
    updateTask as updateTaskStore,
    deleteTask as deleteTaskStore,
    type TaskItem,
    type TaskStatus,
} from "../lib/tasks"

export default function TasksPage() {
    const { t } = useLanguage()
    const { sessions, events, tasks, refreshTasks, request, connected } = useGateway()

    const STATUSES: { id: TaskStatus; label: string; icon: React.ReactNode; color: string; border: string }[] = [
        { id: 'planned', label: t('tasks.status_planned'), icon: <Circle className="w-4 h-4" />, color: 'bg-well text-dim', border: 'border-rim' },
        { id: 'in_progress', label: t('tasks.status_in_progress'), icon: <Activity className="w-4 h-4" />, color: 'bg-info-dim text-info', border: 'border-rim' },
        { id: 'waiting_approval', label: t('tasks.status_waiting'), icon: <AlertCircle className="w-4 h-4" />, color: 'bg-warn-dim text-warn', border: 'border-rim' },
        { id: 'review', label: t('tasks.status_review'), icon: <Shield className="w-4 h-4" />, color: 'bg-accent-dim text-accent', border: 'border-rim' },
        { id: 'done', label: t('tasks.status_done'), icon: <CheckCircle className="w-4 h-4" />, color: 'bg-ok-dim text-ok', border: 'border-rim' },
    ]

    const [newTaskTitle, setNewTaskTitle] = useState("")
    const [isAdding, setIsAdding] = useState(false)
    const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null)
    const [newTaskSessionKey, setNewTaskSessionKey] = useState("agent:main:main")
    const [dispatchStatus, setDispatchStatus] = useState<{ id: string, message: string } | null>(null)
    const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
    const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null)
    const [newTaskDesc, setNewTaskDesc] = useState("")
    const [showDescField, setShowDescField] = useState(false)
    const [editingTask, setEditingTask] = useState<{ id: string; title: string; description: string; tags: string[]; topic?: string } | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [agentFilter, setAgentFilter] = useState<string>('all')
    const [tagFilter, setTagFilter] = useState<string>('all')

    // Agents derived from gateway sessions
    const agentsById = useMemo(() => {
        const result: Record<string, { id: string; name?: string; role?: string }> = {}
        for (const session of sessions.values()) {
            if (!result[session.agentId]) {
                result[session.agentId] = { id: session.agentId }
            }
        }
        return result
    }, [sessions])

    // Sessions list for dispatch selector
    const sessionList = useMemo(() => Array.from(sessions.values()), [sessions])

    // Task events from gateway context (in-session only)
    const selectedTaskEvents = useMemo(() => {
        if (!selectedTask?.sourceRunId) return []
        const runEvents = events.filter(e => e.runId === selectedTask.sourceRunId)
        // Merge and deduplicate similar to original logic
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const merged: any[] = []
        for (const e of runEvents) {
            const rawText = extractTextFromEvent(e).trim()
            if (!rawText) continue
            const role = detectRole(e)
            let mergedIntoExisting = false
            const lookbackLimit = Math.max(0, merged.length - 10)
            for (let j = merged.length - 1; j >= lookbackLimit; j--) {
                const prev = merged[j]
                const sameId = prev.eventId && prev.eventId === e.eventId
                if (sameId || prev.text === rawText) {
                    if (e.kind === 'chat') prev.kind = 'chat'
                    prev.ts = Math.max(prev.ts, e.ts)
                    if (rawText.length > prev.text.length) prev.text = rawText
                    mergedIntoExisting = true
                    break
                }
                if (rawText.startsWith(prev.text)) {
                    prev.text = rawText
                    if (e.kind === 'chat') prev.kind = 'chat'
                    prev.ts = Math.max(prev.ts, e.ts)
                    mergedIntoExisting = true
                    break
                }
                if (prev.text.startsWith(rawText)) {
                    prev.ts = Math.max(prev.ts, e.ts)
                    mergedIntoExisting = true
                    break
                }
            }
            if (!mergedIntoExisting) {
                merged.push({ ...e, text: rawText, role })
            }
        }
        return merged.map(m => ({ ...m, text: m.text.trim() })).filter(m => m.text.length > 0)
    }, [selectedTask?.sourceRunId, events])

    const handleCreateTask = (e: React.FormEvent) => {
        e.preventDefault()
        if (!newTaskTitle.trim()) return
        setIsAdding(true)
        createTaskStore({
            title: newTaskTitle.trim(),
            description: newTaskDesc.trim() || undefined,
            status: 'planned',
            sessionKey: newTaskSessionKey,
            autoGenerated: false,
        })
        refreshTasks()
        setNewTaskTitle("")
        setNewTaskDesc("")
        setShowDescField(false)
        setIsAdding(false)
    }

    const handleUpdateStatus = async (id: string, newStatus: TaskStatus, updatedSessionKey?: string) => {
        const task = tasks.find(t => t.id === id)
        if (!task) return

        const sessionKey = updatedSessionKey || task.sessionKey || newTaskSessionKey

        updateTaskStore(id, { status: newStatus, sessionKey: sessionKey || undefined })
        refreshTasks()

        if (selectedTask?.id === id) {
            setSelectedTask(prev => prev ? { ...prev, status: newStatus, sessionKey: sessionKey || prev.sessionKey } : null)
        }

        if (newStatus === 'in_progress' && connected) {
            setDispatchStatus({ id, message: t('tasks.dispatching') })
            const idempotencyKey = `task-dispatch:${id}:${Date.now()}`
            updateTaskStore(id, { sourceRunId: idempotencyKey })
            try {
                await request('chat.send', {
                    sessionKey: sessionKey || 'agent:main:main',
                    idempotencyKey,
                    message: [task.title, task.description].filter(Boolean).join('\n\n'),
                })
                setDispatchStatus({ id, message: t('tasks.dispatched') })
                setTimeout(() => setDispatchStatus(null), 3000)
            } catch {
                setDispatchStatus({ id, message: t('tasks.dispatch_failed') })
                setTimeout(() => setDispatchStatus(null), 3000)
            }
            refreshTasks()
        }
    }

    const handleDeleteTask = (id: string) => {
        deleteTaskStore(id)
        refreshTasks()
        if (selectedTask?.id === id) setSelectedTask(null)
        setConfirmDelete(null)
    }

    const handleApproval = (id: string, action: 'approve' | 'reject') => {
        updateTaskStore(id, { status: action === 'approve' ? 'in_progress' : 'planned' })
        refreshTasks()
    }

    const handleEditTask = () => {
        if (!editingTask || !editingTask.title.trim()) return
        updateTaskStore(editingTask.id, {
            title: editingTask.title.trim(),
            description: editingTask.description.trim() || undefined,
            topic: editingTask.topic?.trim() || undefined,
            tags: editingTask.tags,
        })
        refreshTasks()
        if (selectedTask?.id === editingTask.id) {
            setSelectedTask(prev => prev ? { ...prev, ...editingTask, title: editingTask.title.trim() } : null)
        }
        setEditingTask(null)
    }

    const filteredTasks = (searchQuery.trim()
        ? tasks.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()) || t.description?.toLowerCase().includes(searchQuery.toLowerCase()) || t.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase())))
        : tasks)
        .filter(t => {
            if (agentFilter === 'all') return true
            const sk = t.sessionKey || ''
            const match = /^agent:([^:]+):/.exec(sk)
            const agentId = match?.[1]
            return agentId === agentFilter
        })
        .filter(t => {
            if (tagFilter === 'all') return true
            return t.tags?.includes(tagFilter)
        })

    return (
        <div className="min-h-screen bg-surface text-ink p-6 md:p-12 font-sans relative overflow-x-hidden">
            <div className="fixed top-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-accent/5 blur-[150px] pointer-events-none" />

            <div className="max-w-7xl mx-auto z-10 relative h-full flex flex-col">
                <header className="mb-8 border-b border-rim pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-ink flex items-center gap-3 mb-2">
                            <ListTodo className="w-8 h-8 text-accent" />
                            {t('tasks.title')}
                        </h1>
                        <p className="text-dim text-lg flex items-center gap-2">
                            {t('tasks.subtitle')}
                        </p>
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <form onSubmit={handleCreateTask} className="flex flex-col sm:flex-row gap-2 flex-1 md:w-[480px]">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={newTaskTitle}
                                    onChange={(e) => setNewTaskTitle(e.target.value)}
                                    placeholder={t('tasks.new_placeholder')}
                                    className="w-full bg-field border border-rim rounded-full py-2.5 pl-5 pr-12 text-sm text-ink placeholder:text-mute focus:outline-none focus:border-accent/50 shadow-inner"
                                    disabled={isAdding}
                                />
                                <button
                                    type="submit"
                                    disabled={!newTaskTitle.trim() || isAdding}
                                    className="absolute right-1 top-1 bottom-1 px-3 bg-accent hover:bg-accent-hover disabled:bg-well disabled:text-mute rounded-full transition-colors flex items-center justify-center text-white"
                                >
                                    {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                </button>
                            </div>
                            <select
                                value={newTaskSessionKey}
                                onChange={(e) => setNewTaskSessionKey(e.target.value)}
                                className="bg-field border border-rim rounded-full py-2.5 px-4 text-sm text-dim focus:outline-none focus:border-accent/50 sm:w-auto w-full hidden sm:block truncate shrink-0 max-w-[150px]"
                                disabled={isAdding}
                                title="Default Agent Session"
                            >
                                <option value="agent:main:main">
                                    {agentsById['main']?.name || 'Main'} (agent:main:main)
                                </option>
                                {sessionList
                                    .filter(s => s.sessionKey !== 'agent:main:main')
                                    .map(s => {
                                        const sk = s.sessionKey
                                        const match = /^agent:([^:]+):/.exec(sk)
                                        const agentId = match?.[1]
                                        const agentMeta = agentId ? agentsById[agentId] : undefined
                                        const label = agentMeta?.name ? `${agentMeta.name} (${sk})` : sk
                                        return <option key={sk} value={sk}>{label}</option>
                                    })}
                            </select>
                        </form>
                        <button
                            onClick={() => setShowDescField(!showDescField)}
                            className="px-3 py-2.5 bg-panel hover:bg-well rounded-full text-xs font-medium transition-colors border border-rim whitespace-nowrap hidden sm:flex items-center gap-1 text-dim hover:text-ink"
                        >
                            <AlignLeft className="w-3 h-3" /> {t('tasks.desc_btn')}
                        </button>
                        <a href="/agents" className="px-5 py-2.5 bg-panel hover:bg-well rounded-full text-sm font-medium transition-colors border border-rim whitespace-nowrap hidden sm:block text-dim hover:text-ink">
                            {t('tasks.back_agents')}
                        </a>
                    </div>
                    {showDescField && (
                        <textarea
                            value={newTaskDesc}
                            onChange={(e) => setNewTaskDesc(e.target.value)}
                            placeholder={t('tasks.desc_placeholder')}
                            rows={2}
                            className="w-full bg-field border border-rim rounded-2xl py-2.5 px-5 text-sm text-ink placeholder:text-mute focus:outline-none focus:border-accent/50 shadow-inner resize-none"
                        />
                    )}
                </header>

                <div className="mb-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-mute" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('tasks.search_placeholder')}
                            className="w-full bg-field border border-rim rounded-full py-2 pl-10 pr-4 text-sm text-ink placeholder:text-mute focus:outline-none focus:border-accent/50"
                        />
                    </div>
                    <select
                        value={agentFilter}
                        onChange={e => setAgentFilter(e.target.value)}
                        className="bg-field border border-rim rounded-full py-2 px-4 text-xs text-dim focus:outline-none focus:border-accent/50 shrink-0 max-w-[180px]"
                    >
                        <option value="all">{t('tasks.filter_all_agents') ?? 'All agents'}</option>
                        {Object.values(agentsById).map(agent => (
                            <option key={agent.id} value={agent.id}>{agent.name || agent.id}</option>
                        ))}
                    </select>
                    <select
                        value={tagFilter}
                        onChange={e => setTagFilter(e.target.value)}
                        className="bg-field border border-rim rounded-full py-2 px-4 text-xs text-dim focus:outline-none focus:border-accent/50 shrink-0 max-w-[180px]"
                    >
                        <option value="all">{t('tasks.filter_all_tags') ?? 'All tags'}</option>
                        {Array.from(new Set(tasks.flatMap(t => t.tags || []))).map(tag => (
                            <option key={tag} value={tag}>{tag}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col md:flex-row gap-6 items-start overflow-x-auto pb-4 custom-scrollbar snap-x flex-1">
                    {STATUSES.map(column => {
                        const columnTasks = filteredTasks.filter(t => t.status === column.id)
                        return (
                            <div
                                key={column.id}
                                className={`min-w-[320px] w-full md:w-[320px] lg:flex-1 shrink-0 bg-panel border rounded-3xl p-4 flex flex-col h-[65vh] md:h-[calc(100vh-250px)] snap-center transition-all duration-200 shadow-sm ${dragOverColumn === column.id ? 'border-accent/40 ring-2 ring-accent/15 bg-accent-dim' : 'border-rim'}`}
                                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverColumn !== column.id) setDragOverColumn(column.id) }}
                                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverColumn(null) }}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    setDragOverColumn(null)
                                    const taskId = e.dataTransfer.getData('text/plain')
                                    if (taskId) {
                                        const task = tasks.find(t => t.id === taskId)
                                        if (task && task.status !== column.id) handleUpdateStatus(taskId, column.id)
                                    }
                                    setDraggedTaskId(null)
                                }}
                            >
                                <div className={`flex items-center justify-between p-3 rounded-2xl mb-4 ${column.color}`}>
                                    <h3 className="font-bold flex items-center gap-2">{column.icon} {column.label}</h3>
                                    <span className="bg-surface/40 px-2 py-0.5 rounded-full text-xs font-bold text-inherit">{columnTasks.length}</span>
                                </div>
                                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1 pb-1">
                                    {columnTasks.map(task => (
                                        <div
                                            key={task.id}
                                            draggable
                                            onDragStart={(e) => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; setDraggedTaskId(task.id) }}
                                            onDragEnd={() => { setDraggedTaskId(null); setDragOverColumn(null) }}
                                            onClick={() => setSelectedTask(task)}
                                            className={`bg-surface hover:bg-well border ${column.border} rounded-2xl p-4 cursor-grab active:cursor-grabbing transition-all duration-200 hover:shadow-sm hover:border-rim-hi flex flex-col gap-3 group ${draggedTaskId === task.id ? 'opacity-40 scale-95' : ''}`}
                                        >
                                            <p className={`text-sm font-medium leading-relaxed ${task.status === 'done' ? 'line-through text-mute' : 'text-ink'}`}>
                                                {task.title}
                                            </p>
                                            {(task.description || task.autoGenerated) && (
                                                <div className="flex items-center justify-between text-xs mt-1">
                                                    {task.autoGenerated ? (
                                                        <span className="uppercase font-bold tracking-wider text-accent bg-accent-dim px-2 flex items-center h-5 rounded shadow-sm">
                                                            {t('tasks.auto_generated')}
                                                        </span>
                                                    ) : <span />}
                                                    {task.description && <AlignLeft className="w-4 h-4 text-mute group-hover:text-dim transition-colors" />}
                                                </div>
                                            )}
                                            {task.topic && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-dim text-accent border border-accent/50">{task.topic}</span>
                                                </div>
                                            )}
                                            {task.tags && task.tags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {task.tags.map(tag => (
                                                        <span key={tag} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-well text-dim border border-rim">{tag}</span>
                                                    ))}
                                                </div>
                                            )}
                                            {task.sessionKey && (
                                                <div className="flex items-center mt-1 text-[10px] text-mute gap-1">
                                                    <Wifi className="w-3 h-3" />
                                                    <span className="truncate max-w-[220px]">{(() => {
                                                        const sk = task.sessionKey || ''
                                                        const match = /^agent:([^:]+):/.exec(sk)
                                                        const agentId = match?.[1]
                                                        const agentMeta = agentId ? agentsById[agentId] : undefined
                                                        return agentMeta?.name ? `${agentMeta.name} (${sk})` : sk
                                                    })()}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {columnTasks.length === 0 && (
                                        <div className={`text-center py-8 text-sm border-2 border-dashed rounded-2xl transition-colors ${dragOverColumn === column.id ? 'border-accent/30 text-accent/50' : 'border-rim text-mute'}`}>
                                            {dragOverColumn === column.id ? t('tasks.drop_here') : t('tasks.no_tasks')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Task Detail Modal */}
            {selectedTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setSelectedTask(null) }}>
                    <div className="bg-panel border border-rim w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-rim flex justify-between items-start">
                            <div className="pr-4">
                                <h2 className="text-xl font-bold text-ink leading-tight">{selectedTask.title}</h2>
                                <div className="flex items-center gap-2 mt-3 font-mono text-[10px] md:text-xs text-mute flex-wrap">
                                    <span className="bg-well px-2 py-1 rounded max-w-[200px] truncate">{selectedTask.id}</span>
                                    <span>•</span>
                                    <span>{new Date(selectedTask.createdAt).toLocaleString()}</span>
                                    {selectedTask.autoGenerated && (
                                        <><span>•</span><span className="text-accent font-bold bg-accent-dim px-2 py-0.5 rounded">AUTO-GENERATED</span></>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button onClick={() => setEditingTask({ id: selectedTask.id, title: selectedTask.title, description: selectedTask.description || '', tags: selectedTask.tags || [], topic: selectedTask.topic })} className="p-2 bg-well hover:bg-rim rounded-full transition-colors text-dim hover:text-accent">
                                    <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={() => setConfirmDelete(selectedTask.id)} className="p-2 bg-well hover:bg-err-dim rounded-full transition-colors text-dim hover:text-err">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => setSelectedTask(null)} className="p-2 bg-well hover:bg-rim rounded-full transition-colors text-dim hover:text-ink">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 select-text overflow-y-auto flex-1 text-sm custom-scrollbar bg-well/50">
                            <div className="mb-6">
                                <h4 className="uppercase text-xs font-bold text-mute tracking-wider mb-2">{t('tasks.description')}</h4>
                                <div className="bg-panel border border-rim rounded-2xl p-4 text-dim min-h-[100px] whitespace-pre-wrap leading-relaxed">
                                    {selectedTask.description || <span className="text-mute italic">{t('tasks.no_description')}</span>}
                                </div>
                            </div>

                            {selectedTask.tags && selectedTask.tags.length > 0 && (
                                <div className="mb-6">
                                    <h4 className="uppercase text-xs font-bold text-mute tracking-wider mb-2">{t('tasks.tags')}</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedTask.tags.map(tag => (
                                            <span key={tag} className="text-xs font-bold px-3 py-1 rounded-full bg-well text-dim border border-rim">{tag}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {(selectedTask.sourceRunId || selectedTask.sessionKey) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    {selectedTask.sourceRunId && (
                                        <div className="bg-panel p-4 rounded-2xl border border-rim">
                                            <p className="uppercase text-[10px] font-bold text-mute tracking-wider mb-1">{t('tasks.source_run')}</p>
                                            <p className="font-mono text-accent text-xs break-words select-all">{selectedTask.sourceRunId}</p>
                                        </div>
                                    )}
                                    {selectedTask.sessionKey && (
                                        <div className="bg-panel p-4 rounded-2xl border border-rim">
                                            <p className="uppercase text-[10px] font-bold text-mute tracking-wider mb-1">{t('tasks.session_key')}</p>
                                            <p className="font-mono text-info text-xs break-words select-all mb-3">{selectedTask.sessionKey}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {selectedTask.status === 'waiting_approval' && (
                                <div className="mb-6 p-5 bg-warn-dim border border-warn/20 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 text-warn">
                                        <AlertCircle className="w-6 h-6 shrink-0" />
                                        <div>
                                            <p className="font-bold text-sm">{t('tasks.action_required')}</p>
                                            <p className="text-xs opacity-80">{t('tasks.approval_message')}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 w-full sm:w-auto shrink-0">
                                        <button onClick={() => { handleApproval(selectedTask.id, 'approve'); setSelectedTask(null) }} className="flex-1 sm:flex-none px-4 py-2 bg-ok-dim hover:bg-ok/20 text-ok text-sm font-bold rounded-xl transition-colors">
                                            {t('tasks.approve')}
                                        </button>
                                        <button onClick={() => { handleApproval(selectedTask.id, 'reject'); setSelectedTask(null) }} className="flex-1 sm:flex-none px-4 py-2 bg-err-dim hover:bg-err/20 text-err text-sm font-bold rounded-xl transition-colors">
                                            {t('tasks.reject')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {selectedTask.sourceRunId && (
                                <div className="mt-8 border-t border-rim pt-6">
                                    <h4 className="uppercase text-xs font-bold text-mute tracking-wider mb-3">
                                        {t('tasks.agent_logs')}
                                        <span className="ml-2 text-mute font-normal normal-case text-[10px]">(current session only)</span>
                                    </h4>
                                    {selectedTaskEvents.length === 0 ? (
                                        <div className="text-mute italic text-sm p-4 bg-panel rounded-2xl border border-rim">
                                            {t('tasks.no_events')}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {selectedTaskEvents.map((evt, idx) => (
                                                <div key={evt.eventId || idx} className={`p-4 rounded-2xl border ${evt.kind === 'chat' ? 'bg-accent-dim border-accent/20' : 'bg-panel border-rim'}`}>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${evt.kind === 'chat' ? 'bg-accent/15 text-accent' : 'bg-well text-dim'}`}>
                                                            {evt.kind || 'log'}
                                                        </span>
                                                        <span className="text-xs text-mute font-mono">{new Date(evt.ts).toLocaleTimeString()}</span>
                                                    </div>
                                                    <div className="text-dim leading-relaxed text-[13px] prose prose-sm max-w-none prose-pre:bg-well prose-pre:border prose-pre:border-rim prose-pre:rounded-xl prose-code:text-accent prose-a:text-accent">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{evt.text}</ReactMarkdown>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-rim bg-well/30 flex flex-col gap-4">
                            {dispatchStatus?.id === selectedTask.id && (
                                <div className={`text-sm px-4 py-2 rounded-xl mb-2 text-center font-medium ${dispatchStatus.message.includes('success') || dispatchStatus.message.includes('dispatched') ? 'bg-ok-dim text-ok border border-ok/20' : dispatchStatus.message.includes('fail') ? 'bg-err-dim text-err border border-err/20' : 'bg-info-dim text-info border border-info/20 animate-pulse'}`}>
                                    {dispatchStatus.message}
                                </div>
                            )}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-dim shrink-0">{t('tasks.move_to')}</span>
                                    {selectedTask.status === 'planned' && (
                                        <select
                                            value={newTaskSessionKey}
                                            onChange={(e) => setNewTaskSessionKey(e.target.value)}
                                            className="bg-field border border-rim rounded-xl py-2 px-3 text-xs text-dim focus:outline-none focus:border-accent/50 max-w-[150px] truncate"
                                        >
                                            <option value="agent:main:main">agent:main:main</option>
                                            {sessionList.filter(s => s.sessionKey !== 'agent:main:main').map(s => (
                                                <option key={s.sessionKey} value={s.sessionKey}>{s.sessionKey}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2 sm:justify-end">
                                    {STATUSES.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => handleUpdateStatus(selectedTask.id, s.id, (s.id === 'in_progress' && selectedTask.status === 'planned') ? newTaskSessionKey : undefined)}
                                            className={`px-3 py-2 rounded-xl text-[13px] font-semibold transition-all border outline-none ${selectedTask.status === s.id ? `${s.color} border-current shadow-sm pointer-events-none opacity-60` : 'bg-panel text-dim border-rim hover:bg-well hover:text-ink hover:border-rim-hi'}`}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Delete */}
            {confirmDelete && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null) }}>
                    <div className="bg-panel border border-err/20 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                        <h3 className="text-lg font-bold text-ink mb-2">{t('tasks.delete_title')}</h3>
                        <p className="text-dim text-sm mb-6">{t('tasks.delete_body')}</p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 bg-well hover:bg-rim rounded-xl text-sm font-medium text-dim border border-rim transition-colors">{t('app.cancel')}</button>
                            <button onClick={() => handleDeleteTask(confirmDelete)} className="px-4 py-2 bg-err-dim hover:bg-err/20 rounded-xl text-sm font-bold text-err border border-err/20 transition-colors">{t('tasks.delete_confirm')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Task */}
            {editingTask && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setEditingTask(null) }}>
                    <div className="bg-panel border border-rim rounded-2xl p-6 max-w-lg w-full shadow-2xl">
                        <h3 className="text-lg font-bold text-ink mb-4">{t('tasks.edit_title')}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-dim uppercase tracking-wider mb-1">{t('tasks.edit_field_title')}</label>
                                <input type="text" value={editingTask.title} onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })} className="w-full bg-field border border-rim rounded-xl py-2.5 px-4 text-sm text-ink focus:outline-none focus:border-accent/50" autoFocus />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-dim uppercase tracking-wider mb-1">{t('tasks.edit_field_desc')}</label>
                                <textarea value={editingTask.description} onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })} rows={4} className="w-full bg-field border border-rim rounded-xl py-2.5 px-4 text-sm text-ink focus:outline-none focus:border-accent/50 resize-none placeholder:text-mute" placeholder={t('tasks.desc_placeholder')} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-mute mb-1">Topic</label>
                                <input type="text" value={editingTask.topic || ''} onChange={(e) => setEditingTask({ ...editingTask, topic: e.target.value })} className="w-full bg-field border border-rim rounded-xl py-2 px-3 text-xs text-ink focus:outline-none focus:border-accent/50 placeholder:text-mute" placeholder="e.g. hh, OpenClwList, Notion, client:Viora" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-dim uppercase tracking-wider mb-1">{t('tasks.edit_field_tags')}</label>
                                <input type="text" value={editingTask.tags.join(', ')} onChange={(e) => setEditingTask({ ...editingTask, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} className="w-full bg-field border border-rim rounded-xl py-2.5 px-4 text-sm text-ink focus:outline-none focus:border-accent/50 placeholder:text-mute" placeholder={t('tasks.edit_tags_placeholder')} />
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end mt-6">
                            <button onClick={() => setEditingTask(null)} className="px-4 py-2 bg-well hover:bg-rim rounded-xl text-sm font-medium text-dim border border-rim transition-colors">{t('app.cancel')}</button>
                            <button onClick={handleEditTask} disabled={!editingTask.title.trim()} className="px-4 py-2 bg-accent-dim hover:bg-accent/20 disabled:opacity-50 rounded-xl text-sm font-bold text-accent border border-accent/20 transition-colors">{t('tasks.edit_save')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ---- helpers ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextFromEvent(event: any): string {
    if (!event || !event.payload) return ''
    const payload = event.payload
    const msg = payload.message || payload.data || payload.input || payload.prompt || payload.query || payload
    if (typeof msg === 'string') return msg
    if (msg && typeof msg === 'object') {
        if (typeof msg.text === 'string') return msg.text
        if (typeof msg.content === 'string') return msg.content
        if (Array.isArray(msg.content)) return msg.content.map((c: any) => c.text || c.content || '').join('')
        if (Array.isArray(msg.messages)) return msg.messages.map((m: any) => typeof m === 'string' ? m : (m.text || m.content || '')).join('')
    }
    return ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectRole(ev: any): 'user' | 'agent' | 'tool' | 'system' {
    if (ev.kind === 'tool' || ev.toolName) return 'tool'
    const payload = ev.payload || {}
    const msg = payload.message || {}
    const role = msg.role
    if (role === 'user') return 'user'
    if (role === 'assistant' || role === 'agent') return 'agent'
    return 'system'
}
