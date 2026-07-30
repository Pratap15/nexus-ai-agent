export default function ThinkingIndicator({ text }) {
  return (
    <div className="thinking-wrapper">
      <div className="dots">
        <div className="dot" />
        <div className="dot" />
        <div className="dot" />
      </div>
      <span>{text || 'Thinking…'}</span>
    </div>
  )
}
