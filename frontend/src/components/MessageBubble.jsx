/**
 * Minimal markdown renderer.
 * Converts a subset of Markdown to React elements.
 */
function renderMarkdown(text) {
  const lines = text.split('\n')
  const elements = []
  let codeBlock = []
  let inCode = false
  let codeLang = ''

  const flushCode = (key) => {
    elements.push(
      <pre key={key}>
        <code className={codeLang ? `language-${codeLang}` : ''}>
          {codeBlock.join('\n')}
        </code>
      </pre>
    )
    codeBlock = []
    codeLang = ''
  }

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      if (inCode) {
        flushCode(`code-${i}`)
        inCode = false
      } else {
        inCode = true
        codeLang = line.slice(3).trim()
      }
      return
    }
    if (inCode) { codeBlock.push(line); return }

    // Headings
    const h3 = line.match(/^###\s+(.+)/)
    const h2 = line.match(/^##\s+(.+)/)
    const h1 = line.match(/^#\s+(.+)/)
    if (h1) { elements.push(<h1 key={i}>{inlineFormat(h1[1])}</h1>); return }
    if (h2) { elements.push(<h2 key={i}>{inlineFormat(h2[1])}</h2>); return }
    if (h3) { elements.push(<h3 key={i}>{inlineFormat(h3[1])}</h3>); return }

    // List items
    const li = line.match(/^[-*]\s+(.+)/)
    const oli = line.match(/^\d+\.\s+(.+)/)
    if (li)  { elements.push(<li key={i}>{inlineFormat(li[1])}</li>); return }
    if (oli) { elements.push(<li key={i}>{inlineFormat(oli[1])}</li>); return }

    // Blank line = spacer
    if (line.trim() === '') { elements.push(<br key={i} />); return }

    // Default paragraph
    elements.push(<p key={i}>{inlineFormat(line)}</p>)
  })

  if (inCode) flushCode('code-last')

  return elements
}

/** Apply inline bold/italic/code/link formatting. */
function inlineFormat(text) {
  // Split on bold, italic, inline-code, and links
  const parts = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g
  let last = 0
  let m

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[2] != null) parts.push(<strong key={m.index}>{m[2]}</strong>)
    else if (m[3] != null) parts.push(<em key={m.index}>{m[3]}</em>)
    else if (m[4] != null) parts.push(<code key={m.index}>{m[4]}</code>)
    else if (m[5] != null) parts.push(<a key={m.index} href={m[6]} target="_blank" rel="noreferrer">{m[5]}</a>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

// ---------------------------------------------------------------------------
// Clean XML action tags from streamed text for display
// ---------------------------------------------------------------------------
function cleanAgentText(raw) {
  return raw
    .replace(/<search>(.*?)<\/search>/gs, (_, q) => `🔍 *Searching: ${q.trim()}*\n`)
    .replace(/<create_file name="([^"]+)">([\s\S]*?)<\/create_file>/g, (_, name) => `📄 *Creating file: ${name}*\n`)
    .replace(/<finish>([\s\S]*?)<\/finish>/g, (_, s) => `\n---\n${s.trim()}`)
    .trim()
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------
export default function MessageBubble({ message }) {
  const { type, content, streaming, tool, query, filename } = message

  // User message
  if (type === 'user') {
    return (
      <div className="message-wrapper user">
        <div className="avatar user">U</div>
        <div className="bubble user">{content}</div>
      </div>
    )
  }

  // Agent streamed response
  if (type === 'agent_stream') {
    const display = streaming ? content : cleanAgentText(content)
    return (
      <div className="message-wrapper agent">
        <div className="avatar agent">N</div>
        <div className="bubble agent md-content">
          {renderMarkdown(display)}
          {streaming && <span className="stream-cursor" />}
        </div>
      </div>
    )
  }

  // Tool use: search
  if (type === 'tool_use' && tool === 'search') {
    return (
      <div className="tool-card search">
        <span className="tool-icon">🔍</span>
        <span className="tool-text">Searching: <em>{query || content}</em></span>
      </div>
    )
  }

  // Tool use: file creation
  if (type === 'tool_use' && tool === 'create_file') {
    return (
      <div className="tool-card file">
        <span className="tool-icon">📄</span>
        <span className="tool-text">Creating file: <strong>{filename || content}</strong></span>
      </div>
    )
  }

  // File created confirmation
  if (type === 'file_created') {
    return (
      <div className="tool-card file">
        <span className="tool-icon">✅</span>
        <span className="tool-text">File created: <strong>{filename || content}</strong></span>
      </div>
    )
  }

  // Status / thinking
  if (type === 'status' || type === 'thinking') {
    return (
      <div className="tool-card status">
        <span className="tool-icon">⚡</span>
        <span className="tool-text">{content}</span>
      </div>
    )
  }

  // Warning
  if (type === 'warning') {
    return (
      <div className="tool-card warning">
        <span className="tool-icon">⚠️</span>
        <span className="tool-text">{content}</span>
      </div>
    )
  }

  // Error
  if (type === 'error') {
    return (
      <div className="tool-card error">
        <span className="tool-icon">❌</span>
        <span className="tool-text">{content}</span>
      </div>
    )
  }

  // Finish / summary
  if (type === 'agent_finish') {
    return (
      <div className="message-wrapper agent">
        <div className="avatar agent">N</div>
        <div className="bubble agent md-content">
          <div className="tool-card finish" style={{ marginBottom: 10, maxWidth: '100%' }}>
            <span className="tool-icon">🏁</span>
            <span className="tool-text" style={{ fontWeight: 600 }}>Task Complete</span>
          </div>
          {renderMarkdown(content)}
        </div>
      </div>
    )
  }

  // Agent start
  if (type === 'agent_start') {
    return (
      <div className="tool-card status">
        <span className="tool-icon">🚀</span>
        <span className="tool-text">{content}</span>
      </div>
    )
  }

  // Fallback – don't render unknown types
  return null
}
