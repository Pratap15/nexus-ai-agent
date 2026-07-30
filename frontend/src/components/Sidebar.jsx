export default function Sidebar({
  sessions,
  currentSessionId,
  onNewChat,
  onSelectSession,
  theme,
  onToggleTheme,
  collapsed,
  onToggleCollapse,
}) {
  function formatTime(ts) {
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now - d
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffH = Math.floor(diffMins / 60)
    if (diffH < 24) return `${diffH}h ago`
    return d.toLocaleDateString()
  }

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="logo-icon">N</div>
        {!collapsed && (
          <div>
            <div className="logo-text">NEXUS</div>
            <div className="logo-sub">AI Agent</div>
          </div>
        )}
      </div>

      {/* New chat */}
      {!collapsed && (
        <button className="new-chat-btn" onClick={onNewChat}>
          <span>＋</span>
          <span>New Chat</span>
        </button>
      )}

      {/* Session list */}
      <div className="session-list">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`session-item ${s.id === currentSessionId ? 'active' : ''}`}
            onClick={() => onSelectSession(s.id)}
            title={s.title}
          >
            <span className="icon">💬</span>
            {!collapsed && (
              <div className="session-info">
                <div className="session-title">{s.title}</div>
                <div className="session-time">{formatTime(s.timestamp)}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer controls */}
      <div className="sidebar-footer">
        <button
          className="icon-btn"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button
          className="icon-btn"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleCollapse}
          style={{ marginLeft: 'auto' }}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>
    </aside>
  )
}
