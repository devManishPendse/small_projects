import Mascot from './Mascot.jsx';

export default function Sidebar({ conversations, activeId, disabled, mode, open, onSelect, onNew, onDelete, onClose }) {
  return (
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand">
        <Mascot size={48} />
        <h1>Bubbles</h1>
      </div>

      <button className="btn btn-new" onClick={onNew} disabled={disabled}>
        ＋ New Chat
      </button>

      <h2 className="sidebar-title">Chat Pals</h2>
      <ul className="convo-list">
        {conversations.length === 0 && <li className="convo-empty">No chats yet. Say hi! 👋</li>}
        {conversations.map((c) => (
          <li key={c.id} className={`convo ${c.id === activeId ? 'convo-active' : ''}`}>
            <button className="convo-btn" onClick={() => { onSelect(c.id); onClose(); }} disabled={disabled} title={c.title}>
              💬 {c.title}
            </button>
            <button
              className="convo-del"
              onClick={() => onDelete(c.id)}
              disabled={disabled}
              aria-label={`Delete chat ${c.title}`}
              title="Delete"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className={`mode-badge mode-${mode}`}>
        {mode === 'claude' ? '🟢 Live: Claude' : mode === 'demo' ? '🟡 Demo mode (no API key)' : '⚪ Connecting…'}
      </div>
    </aside>
  );
}
