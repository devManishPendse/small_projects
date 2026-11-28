import { useCallback, useEffect, useRef, useState } from 'react';
import { api, streamMessage } from './api.js';
import Sidebar from './components/Sidebar.jsx';
import MessageBubble from './components/MessageBubble.jsx';
import Composer from './components/Composer.jsx';
import Mascot from './components/Mascot.jsx';

const SUGGESTIONS = [
  'Tell me a joke about robots 🤖',
  'Explain how rainbows work like I’m 8',
  'Give me 3 fun ideas for a rainy day',
];

let tempId = 0;
const localMsg = (role, content, extra = {}) => ({ id: `local-${++tempId}`, role, content, ...extra });

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [mode, setMode] = useState('loading');
  const [menuOpen, setMenuOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const abortRef = useRef(null);
  const bottomRef = useRef(null);

  const refreshList = useCallback(async () => setConversations(await api.listConversations()), []);

  useEffect(() => {
    api.health().then((h) => setMode(h.mode)).catch(() => setMode('offline'));
    refreshList().catch(() => setLoadError("Can't reach the Bubbles server. Is `npm run dev` running?"));
  }, [refreshList]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const selectConversation = async (id) => {
    if (streaming) return;
    const convo = await api.getConversation(id);
    setActiveId(id);
    setMessages(convo.messages);
  };

  const newChat = () => {
    if (streaming) return;
    setActiveId(null);
    setMessages([]);
    setMenuOpen(false);
  };

  const deleteConversation = async (id) => {
    if (!window.confirm('Delete this chat?')) return;
    await api.deleteConversation(id);
    if (id === activeId) newChat();
    refreshList();
  };

  const stop = () => abortRef.current?.abort();

  const send = async (content) => {
    let convoId = activeId;
    try {
      if (!convoId) {
        const created = await api.createConversation();
        convoId = created.id;
        setActiveId(convoId);
      }
    } catch (err) {
      setMessages((m) => [...m, localMsg('assistant', err.message, { error: true })]);
      return;
    }

    const botId = `bot-${++tempId}`;
    setMessages((m) => [...m, localMsg('user', content), { id: botId, role: 'assistant', content: '' }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const patchBot = (fn) => setMessages((m) => m.map((x) => (x.id === botId ? fn(x) : x)));

    try {
      await streamMessage(convoId, content, {
        signal: controller.signal,
        onStart: () => refreshList(),
        onToken: (text) => patchBot((x) => ({ ...x, content: x.content + text })),
        onError: (message) => patchBot((x) => ({ ...x, content: x.content ? `${x.content}\n\n${message}` : message, error: !x.content })),
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        patchBot((x) => ({ ...x, content: x.content || err.message, error: !x.content }));
      }
    } finally {
      // Drop an empty bubble (e.g. stopped before the first token arrived).
      setMessages((m) => m.filter((x) => x.id !== botId || x.content));
      setStreaming(false);
      abortRef.current = null;
      refreshList();
    }
  };

  const lastId = messages[messages.length - 1]?.id;

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        disabled={streaming}
        mode={mode}
        open={menuOpen}
        onSelect={selectConversation}
        onNew={newChat}
        onDelete={deleteConversation}
        onClose={() => setMenuOpen(false)}
      />

      <main className="chat">
        <header className="chat-header">
          <button className="btn btn-menu" onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle chat list">☰</button>
          <span className="chat-title">
            {conversations.find((c) => c.id === activeId)?.title ?? 'New chat'}
          </span>
        </header>

        <div className="messages">
          {loadError && <div className="banner">{loadError}</div>}

          {messages.length === 0 && !loadError && (
            <div className="welcome">
              <Mascot size={140} mood="idle" />
              <h2>Hi, I'm Bubbles!</h2>
              <p>Ask me anything — I'll type my answer live, right in front of you.</p>
              <div className="chips">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} streaming={streaming && m.id === lastId && m.role === 'assistant'} />
          ))}
          <div ref={bottomRef} />
        </div>

        <Composer streaming={streaming} onSend={send} onStop={stop} />
      </main>
    </div>
  );
}
