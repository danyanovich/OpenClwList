const state = {
  sessions: [],
  runs: [],
  tasks: [],
  diagnostics: null,
  recentEvents: [],
  selectedRunId: null,
  filters: { agentId: '', channel: '', status: '' },
}

function byId(id) {
  return document.getElementById(id)
}

function fmtTs(ts) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString()
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || response.statusText)
  }
  return await response.json()
}

async function loadSessions() {
  const q = new URLSearchParams()
  if (state.filters.agentId) q.set('agentId', state.filters.agentId)
  if (state.filters.channel) q.set('channel', state.filters.channel)
  if (state.filters.status) q.set('status', state.filters.status)
  const data = await api(`/api/monitor/sessions?${q.toString()}`)
  state.sessions = data.sessions
  renderSessions()
}

async function loadRuns() {
  const q = new URLSearchParams()
  if (state.filters.agentId) q.set('agentId', state.filters.agentId)
  const data = await api(`/api/monitor/runs?${q.toString()}`)
  state.runs = data.runs
  renderRuns()
}

async function loadGraph() {
  const data = await api('/api/monitor/graph?window=3600')
  renderGraph(data)
}

async function loadTasks() {
  const data = await api('/api/tasks')
  state.tasks = data.tasks
  renderTasks()
}

async function loadDiagnostics() {
  const data = await api('/api/monitor/diagnostics')
  state.diagnostics = data.diagnostics
  state.recentEvents = data.recentEvents
  byId('diagnosticsBox').textContent = JSON.stringify(data.diagnostics, null, 2)
  byId('recentEventsBox').textContent = JSON.stringify(data.recentEvents, null, 2)
}

async function loadRunDetail(runId) {
  const data = await api(`/api/monitor/runs/${encodeURIComponent(runId)}/events`)
  state.selectedRunId = runId
  byId('runDetail').textContent = JSON.stringify(data.events, null, 2)
}

function renderSessions() {
  const root = byId('sessionsList')
  root.innerHTML = ''
  for (const s of state.sessions) {
    const li = document.createElement('li')
    li.innerHTML = `<div><strong>${s.sessionKey}</strong></div>
      <div class="tiny">agent=${s.agentId} channel=${s.channel} status=${s.status}</div>
      <div class="tiny">last=${fmtTs(s.lastActivityAt)} ${s.spawnedBy ? ` spawnedBy=${s.spawnedBy}` : ''}</div>`
    root.appendChild(li)
  }
}

function runStateClass(stateValue) {
  if (stateValue === 'error') return 'error'
  if (stateValue === 'aborted') return 'aborted'
  return ''
}

function renderGraph(graph) {
  const root = byId('graphView')
  root.innerHTML = ''
  const sessionsByKey = new Map(graph.sessions.map((s) => [s.sessionKey, s]))

  for (const session of graph.sessions) {
    const sNode = document.createElement('div')
    sNode.className = 'node session'
    sNode.textContent = `S ${session.sessionKey} (${session.status})`
    root.appendChild(sNode)

    for (const run of graph.runs.filter((r) => r.sessionKey === session.sessionKey)) {
      const rNode = document.createElement('div')
      rNode.className = `node run ${runStateClass(run.state)}`
      rNode.textContent = `  └─ R ${run.runId} [${run.state}] ${fmtTs(run.startedAt)}`
      rNode.onclick = () => loadRunDetail(run.runId)
      root.appendChild(rNode)
    }

    if (session.spawnedBy && sessionsByKey.has(session.spawnedBy)) {
      const edge = document.createElement('div')
      edge.className = 'tiny'
      edge.textContent = `spawn: ${session.spawnedBy} -> ${session.sessionKey}`
      root.appendChild(edge)
    }
  }
}

function renderRuns() {
  const tbody = byId('runsTbody')
  tbody.innerHTML = ''
  for (const run of state.runs) {
    const tr = document.createElement('tr')
    tr.dataset.runId = run.runId
    tr.innerHTML = `
      <td>${run.runId}</td>
      <td>${run.sessionKey}</td>
      <td>${run.state}</td>
      <td>${fmtTs(run.startedAt)}</td>
      <td>${fmtTs(run.endedAt)}</td>
    `
    tr.onclick = () => loadRunDetail(run.runId)
    tbody.appendChild(tr)
  }
}

async function setTaskStatus(taskId, status) {
  await api(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
  await loadTasks()
}

function renderTasks() {
  const tbody = byId('tasksTbody')
  if (!tbody) return
  tbody.innerHTML = ''

  for (const task of state.tasks) {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>
        <div><strong>${task.title}</strong></div>
        <div class="tiny">${task.description || ''}</div>
      </td>
      <td>${task.status}</td>
      <td>${task.sessionKey || '-'}</td>
      <td>${task.sourceRunId || '-'}</td>
      <td>${fmtTs(task.createdAt)}</td>
      <td>
        <button class="task-status-btn" data-task-id="${task.id}" data-status="todo">todo</button>
        <button class="task-status-btn" data-task-id="${task.id}" data-status="in_progress">in_progress</button>
        <button class="task-status-btn" data-task-id="${task.id}" data-status="done">done</button>
      </td>
    `
    tbody.appendChild(tr)
  }

  document.querySelectorAll('.task-status-btn').forEach((btn) => {
    btn.onclick = () => {
      const taskId = btn.getAttribute('data-task-id')
      const status = btn.getAttribute('data-status')
      if (!taskId || !status) return
      setTaskStatus(taskId, status).catch((e) => alert(e.message))
    }
  })
}

async function connectGateway() {
  await api('/api/monitor/connect', { method: 'POST' })
  await refreshAll()
}

async function disconnectGateway() {
  await api('/api/monitor/disconnect', { method: 'POST' })
  await loadDiagnostics()
}

async function refreshSessions() {
  await api('/api/monitor/refresh-sessions', { method: 'POST' })
  await loadSessions()
}

async function abortRun() {
  const sessionKey = byId('abortSessionKey').value.trim()
  const runId = byId('abortRunId').value.trim() || undefined
  if (!sessionKey) {
    alert('sessionKey is required')
    return
  }
  await api('/api/monitor/abort', {
    method: 'POST',
    body: JSON.stringify({ sessionKey, runId }),
  })
  await refreshAll()
}

async function refreshAll() {
  await Promise.all([loadSessions(), loadRuns(), loadTasks(), loadGraph(), loadDiagnostics()])
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.tab
      document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'))
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'))
      btn.classList.add('active')
      byId(name).classList.add('active')
    })
  })
}

function setupActions() {
  byId('connectBtn').onclick = () => connectGateway().catch((e) => alert(e.message))
  byId('disconnectBtn').onclick = () => disconnectGateway().catch((e) => alert(e.message))
  byId('refreshBtn').onclick = () => refreshSessions().catch((e) => alert(e.message))
  byId('abortBtn').onclick = () => abortRun().catch((e) => alert(e.message))

  byId('applyFiltersBtn').onclick = () => {
    state.filters.agentId = byId('agentFilter').value.trim()
    state.filters.channel = byId('channelFilter').value.trim()
    state.filters.status = byId('statusFilter').value
    refreshAll().catch((e) => alert(e.message))
  }
}

function setupSse() {
  const source = new EventSource('/api/monitor/events')
  source.onmessage = (_evt) => {
    refreshAll().catch(() => {})
  }
  source.onerror = () => {
    setTimeout(() => setupSse(), 3000)
  }
}

setupTabs()
setupActions()
setupSse()
refreshAll().catch((e) => {
  byId('diagnosticsBox').textContent = e.message
})
setInterval(() => refreshAll().catch(() => {}), 15000)
