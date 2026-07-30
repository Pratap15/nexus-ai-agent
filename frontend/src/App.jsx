import { useState, useEffect, useRef, useCallback } from 'react'
import Sidebar from './components/Sidebar.jsx'
import ChatArea from './components/ChatArea.jsx'
import OutputPanel from './components/OutputPanel.jsx'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateId() {
  // Use the Web Crypto API for a non-guessable session identifier
  const arr = new Uint32Array(3)
  crypto.getRandomValues(arr)
  return `sess_${Date.now()}_${Array.from(arr).map((n) => n.toString(36)).join('')}`
}

function truncateTitle(task, maxLen = 36) {
  const clean = task.replace(/[🔍📊🐍📝]/u, '').trim()
  return clean.length > maxLen ? clean.slice(0, maxLen) + '…' : clean
}

const WS_BASE =
  import.meta.env.VITE_WS_BASE ||
  (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host

const RECONNECT_DELAY = 3000 // ms between reconnect attempts

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [theme, setTheme] = useState('dark')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [panelCollapsed, setPanelCollapsed] = useState(false)

  // Sessions
  const [sessions, setSessions] = useState(() => {
    const id = generateId()
    return [{ id, title: 'New Chat', timestamp: Date.now() }]
  })
  const [currentSessionId, setCurrentSessionId] = useState(() => sessions[0]?.id)

  // Per-session state stored in a ref map (keyed by session id)
  const sessionStateRef = useRef({})

  // Current session derived state
  const [messages, setMessages] = useState([])
  const [files, setFiles] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [statusText, setStatusText] = useState('')

  // Connection state
  const [connected, setConnected] = useState(false)
  const [connError, setConnError] = useState(null)

  // WebSocket
  const wsRef = useRef(null)
  const streamingIdxRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const sessionIdRef = useRef(currentSessionId)

  // Keep sessionIdRef in sync
  useEffect(() => { sessionIdRef.current = currentSessionId }, [currentSessionId])

  // ── Load / save session state on session switch ──────────────────────────
  useEffect(() => {
    if (currentSessionId) {
      sessionStateRef.current[currentSessionId] = { messages, files }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId])

  const switchSession = useCallback((id) => {
    sessionStateRef.current[currentSessionId] = { messages, files }
    setCurrentSessionId(id)
    const prev = sessionStateRef.current[id] || { messages: [], files: [] }
    setMessages(prev.messages)
    setFiles(prev.files)
    setIsRunning(false)
    setStatusText('')
    streamingIdxRef.current = null
    connectWebSocket(id)
  }, [currentSessionId, messages, files]) // eslint-disable-line

  // ── WebSocket ────────────────────────────────────────────────────────────
  const connectWebSocket = useCallback((sessionId) => {
    clearTimeout(reconnectTimerRef.current)

    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.close()
    }

    const ws = new WebSocket(`${WS_BASE}/ws/${sessionId}`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setConnError(null)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        handleServerMessage(msg)
      } catch { /* ignore malformed frames */ }
    }

    ws.onclose = () => {
      setConnected(false)
      setIsRunning(false)
      // Auto-reconnect using the current session id from ref
      reconnectTimerRef.current = setTimeout(() => {
        connectWebSocket(sessionIdRef.current)
      }, RECONNECT_DELAY)
    }

    ws.onerror = () => {
      setConnError('Cannot reach backend. Retrying…')
    }
  }, []) // eslint-disable-line

  // Connect on mount
  useEffect(() => {
    connectWebSocket(currentSessionId)
    return () => {
      clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, []) // eslint-disable-line

  // ── Server message handler ───────────────────────────────────────────────
  const addMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg])
  }, [])

  const handleServerMessage = useCallback((msg) => {
    const { type, content } = msg

    switch (type) {
      case 'agent_start':
        setIsRunning(true)
        setStatusText(content)
        addMessage({ type: 'agent_start', content })
        break

      case 'thinking':
        setStatusText(content)
        break

      case 'stream_start':
        setMessages((prev) => {
          const next = [...prev, { type: 'agent_stream', content: '', streaming: true }]
          streamingIdxRef.current = next.length - 1
          return next
        })
        break

      case 'stream_chunk':
        setMessages((prev) => {
          if (streamingIdxRef.current === null) return prev
          const next = [...prev]
          const idx = streamingIdxRef.current
          if (next[idx]) {
            next[idx] = { ...next[idx], content: next[idx].content + content }
          }
          return next
        })
        break

      case 'stream_end':
        setMessages((prev) => {
          if (streamingIdxRef.current === null) return prev
          const next = [...prev]
          const idx = streamingIdxRef.current
          if (next[idx]) {
            next[idx] = { ...next[idx], streaming: false }
          }
          streamingIdxRef.current = null
          return next
        })
        break

      case 'tool_use':
        addMessage({ type: 'tool_use', content, tool: msg.tool, query: msg.query, filename: msg.filename })
        break

      case 'tool_result':
        // Raw search results are absorbed by the agent; skip showing them in chat
        break

      case 'file_created':
        addMessage({ type: 'file_created', content, filename: msg.filename, download_url: msg.download_url })
        setFiles((prev) => {
          if (prev.find((f) => f.name === msg.filename)) return prev
          const ext = msg.filename?.split('.').pop() || 'txt'
          return [...prev, { name: msg.filename, size: 0, ext }]
        })
        break

      case 'agent_finish':
        addMessage({ type: 'agent_finish', content })
        if (msg.files?.length) refreshFiles()
        break

      case 'agent_done':
        setIsRunning(false)
        setStatusText('')
        if (msg.files?.length) refreshFiles()
        break

      case 'warning':
        addMessage({ type: 'warning', content })
        break

      case 'error':
        addMessage({ type: 'error', content })
        setIsRunning(false)
        setStatusText('')
        break

      case 'step_complete':
        setIsRunning(false)
        setStatusText('')
        break

      default:
        break
    }
  }, [addMessage]) // eslint-disable-line

  const refreshFiles = useCallback(async () => {
    try {
      const res = await fetch(`/files/${currentSessionId}`)
      const data = await res.json()
      setFiles(data.files || [])
    } catch { /* ignore */ }
  }, [currentSessionId])

  // ── Send task ────────────────────────────────────────────────────────────
  const sendTask = useCallback(
    (task) => {
      if (isRunning) return
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setConnError('Not connected to backend. Please wait for reconnection.')
        return
      }

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId ? { ...s, title: truncateTitle(task) } : s
        )
      )

      addMessage({ type: 'user', content: task })
      ws.send(JSON.stringify({ type: 'task', content: task }))
      setIsRunning(true)
    },
    [isRunning, currentSessionId, addMessage]
  )

  // ── New chat ─────────────────────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    sessionStateRef.current[currentSessionId] = { messages, files }
    const id = generateId()
    setSessions((prev) => [{ id, title: 'New Chat', timestamp: Date.now() }, ...prev])
    setCurrentSessionId(id)
    setMessages([])
    setFiles([])
    setIsRunning(false)
    setStatusText('')
    streamingIdxRef.current = null
    connectWebSocket(id)
  }, [currentSessionId, messages, files, connectWebSocket])

  // ── Chip click ───────────────────────────────────────────────────────────
  const handleChipClick = useCallback((text) => sendTask(text), [sendTask])

  // ── Theme ─────────────────────────────────────────────────────────────
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`app-layout ${theme}`}>
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onNewChat={handleNewChat}
        onSelectSession={switchSession}
        theme={theme}
        onToggleTheme={toggleTheme}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Connection error banner */}
        {connError && (
          <div style={{
            background: 'rgba(239,68,68,0.12)',
            borderBottom: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5',
            fontSize: 12,
            padding: '6px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}>
            <span>⚠️</span>
            <span>{connError}</span>
            <span style={{ marginLeft: 'auto', opacity: 0.7 }}>
              {connected ? '● Connected' : '○ Connecting…'}
            </span>
            <button
              onClick={() => setConnError(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0 4px', fontSize: 14 }}
            >✕</button>
          </div>
        )}

        <ChatArea
          messages={messages}
          isRunning={isRunning}
          statusText={statusText}
          onSendTask={sendTask}
          onChipClick={handleChipClick}
          connected={connected}
        />
      </div>

      <OutputPanel
        files={files}
        sessionId={currentSessionId}
        collapsed={panelCollapsed}
        onToggleCollapse={() => setPanelCollapsed((v) => !v)}
      />
    </div>
  )
}
