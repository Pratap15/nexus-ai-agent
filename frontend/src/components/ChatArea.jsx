import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble.jsx'
import ThinkingIndicator from './ThinkingIndicator.jsx'

const SUGGESTIONS = [
  '🔍 Research the latest AI breakthroughs in 2024',
  '📊 Create a CSV of top programming languages',
  '🐍 Write a Python web scraper script',
  '📝 Generate a market research report on EVs',
]

export default function ChatArea({
  messages,
  isRunning,
  statusText,
  onSendTask,
  onChipClick,
  connected,
}) {
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const val = textareaRef.current?.value.trim()
    if (!val || isRunning) return
    onSendTask(val)
    textareaRef.current.value = ''
    textareaRef.current.style.height = 'auto'
  }

  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  const hasMessages = messages.length > 0

  return (
    <main className="chat-area">
      {/* Header */}
      <div className="chat-header">
        <div
          className={`agent-status-dot ${
            isRunning ? 'running' : hasMessages ? '' : 'idle'
          }`}
        />
        <span className="chat-title">
          {isRunning ? statusText || 'Agent running…' : 'NEXUS Agent'}
        </span>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {!hasMessages ? (
          <div className="empty-state">
            <div className="empty-icon">🤖</div>
            <h2>What can I help you with?</h2>
            <p>
              NEXUS is an autonomous AI agent that can research topics, write code,
              generate reports, and create downloadable files.
            </p>
            <div className="suggestion-chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => onChipClick(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => <MessageBubble key={i} message={msg} />)
        )}

        {isRunning && messages.length === 0 && (
          <ThinkingIndicator text={statusText} />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="input-area">
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            className="task-input"
            placeholder="Describe a task for NEXUS… (Shift+Enter for new line)"
            rows={1}
            onKeyDown={handleKeyDown}
            onInput={autoResize}
            disabled={isRunning}
          />
          <button
            className="send-btn"
            onClick={submit}
            disabled={isRunning}
            title="Send task (Enter)"
          >
            {isRunning ? '⏳' : connected === false ? '○' : '▶'}
          </button>
        </div>
        <p className="input-hint">
          NEXUS can search the web, write code, and generate files.
          {' '}Configure <code>NVIDIA_API_KEY</code> or <code>OPENAI_API_KEY</code> for real AI responses.
        </p>
      </div>
    </main>
  )
}
