import { useEffect, useMemo, useRef, useState } from 'react';
import { SAMPLE_TEXT, SAMPLE_QUESTIONS } from './sample.js';

const MAX_WORDS = 10000;

const countWords = (t) => (t.trim().match(/\S+/g) || []).length;

async function api(path, body) {
  const res = await fetch(`/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function App() {
  const [text, setText] = useState('');
  const [view, setView] = useState('edit'); // 'edit' | 'read'
  const [question, setQuestion] = useState('');
  const [model, setModel] = useState({ state: 'loading', message: 'Connecting to the server…', progress: 0 });
  const [analysis, setAnalysis] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(''); // '', 'analyze', 'summarize', 'ask'
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const markRef = useRef(null);

  const words = useMemo(() => countWords(text), [text]);
  const tooLong = words > MAX_WORDS;
  const hasText = words > 0;
  const modelReady = model.state === 'ready';

  // Poll the backend until the AI model has finished loading.
  useEffect(() => {
    if (modelReady) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await api('status');
        if (!stop) setModel(s);
        if (s.state === 'loading' && !stop) setTimeout(tick, 1000);
      } catch {
        if (!stop) {
          setModel({ state: 'error', message: 'Cannot reach the backend. Start it with  npm start', progress: 0 });
          setTimeout(tick, 3000);
        }
      }
    };
    tick();
    return () => {
      stop = true;
    };
  }, [modelReady]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  // Scroll the highlighted answer into view in the reading view.
  useEffect(() => {
    if (view === 'read' && markRef.current) markRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [view, result]);

  const run = async (kind, fn) => {
    setError('');
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const onText = (value) => {
    setText(value);
    setAnalysis(null);
    setResult(null);
  };

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) return setToast('Clipboard is empty');
      onText(clip);
      setView('edit');
      setToast('Pasted from clipboard');
    } catch {
      setError('Your browser blocked clipboard access. Click in the box and press Ctrl+V instead.');
    }
  };

  const loadSample = () => {
    onText(SAMPLE_TEXT);
    setView('edit');
    setQuestion('');
    setError('');
  };

  const clearAll = () => {
    onText('');
    setView('edit');
    setError('');
  };

  const understand = () =>
    run('analyze', async () => {
      setAnalysis(await api('analyze', { text }));
    });

  const summarize = () =>
    run('summarize', async () => {
      const r = await api('summarize', { text });
      setResult({ ...r, question: 'Summarize the paragraph' });
      setHistory((h) => [{ id: Date.now(), question: 'Summarize the paragraph', answer: r.answer }, ...h]);
    });

  const ask = () =>
    run('ask', async () => {
      const q = question.trim();
      const r = await api('ask', { text, question: q });
      setResult({ ...r, question: q });
      setHistory((h) => [{ id: Date.now(), question: q, answer: r.answer || '(no answer found)' }, ...h]);
    });

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(result.answer);
      setToast('Answer copied');
    } catch {
      setToast('Could not copy');
    }
  };

  const readAloud = () => {
    if (!('speechSynthesis' in window)) return setToast('Speech is not supported in this browser');
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.answer));
  };

  const saveHistory = () => {
    const body = [...history]
      .reverse()
      .map((h, i) => `Q${i + 1}. ${h.question}\nAns. ${h.answer}\n`)
      .join('\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'questions-and-answers.txt' });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1>📝 English Paper Assistant</h1>
          <p>Paste a passage · Ask a question · Get the answer from the text</p>
        </div>
        <ModelPill model={model} />
      </header>

      <main className="sheets">
        {/* ---------------------------------------------------- Section A */}
        <section className="sheet">
          <ExamHeader section="Section A" title="Read the Passage" />
          <div className="passage-tools">
            <button className="btn blue" onClick={pasteFromClipboard}>📋 Paste from Clipboard</button>
            <button className="btn orange" onClick={loadSample}>📖 Load Sample</button>
            <button
              className="btn teal"
              onClick={() => setView(view === 'edit' ? 'read' : 'edit')}
              disabled={!hasText}
            >
              {view === 'edit' ? '🔍 Reading View' : '✏️ Edit Passage'}
            </button>
          </div>

          {view === 'edit' ? (
            <textarea
              className="lined passage"
              placeholder="Paste or type your English paragraph here (up to 10,000 words)…"
              value={text}
              onChange={(e) => onText(e.target.value)}
              spellCheck={false}
            />
          ) : (
            <div className="lined passage reading">
              <Highlighted text={text} result={result} markRef={markRef} />
            </div>
          )}

          <WordMeter words={words} tooLong={tooLong} />

          <div className="actions">
            <button className="btn purple" onClick={understand} disabled={!hasText || tooLong || busy}>
              {busy === 'analyze' ? '⏳ Reading…' : '🧠 Understand Paragraph'}
            </button>
            <button className="btn pink" onClick={summarize} disabled={!hasText || tooLong || busy}>
              {busy === 'summarize' ? '⏳ Summarizing…' : '📝 Summarize'}
            </button>
            <button className="btn red" onClick={clearAll} disabled={!hasText}>🧹 Clear Passage</button>
          </div>

          {analysis && <Insights analysis={analysis} />}
        </section>

        {/* ---------------------------------------------------- Section B */}
        <section className="sheet">
          <ExamHeader section="Section B" title="Ask & Answer" />

          <label className="label" htmlFor="q">Your question</label>
          <textarea
            id="q"
            className="lined question"
            placeholder="Type a question about the passage… e.g. Who was the commander?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && question.trim() && hasText && modelReady && !tooLong) ask();
            }}
          />

          {text === SAMPLE_TEXT && (
            <div className="chips">
              <span>Try:</span>
              {SAMPLE_QUESTIONS.map((q) => (
                <button key={q} className="chip" onClick={() => setQuestion(q)}>{q}</button>
              ))}
            </div>
          )}

          <div className="actions">
            <button
              className="btn green big"
              onClick={ask}
              disabled={!hasText || tooLong || !question.trim() || !modelReady || busy}
              title={!modelReady ? 'Waiting for the AI model to load' : 'Ctrl + Enter'}
            >
              {busy === 'ask' ? '⏳ Thinking…' : '🔎 Get Answer'}
            </button>
            <button className="btn red" onClick={() => setQuestion('')} disabled={!question}>🧹 Clear Question</button>
          </div>

          {error && <div className="alert error">⚠️ {error}</div>}
          {!hasText && <div className="alert info">👈 Start by pasting a paragraph in Section A.</div>}
          {tooLong && <div className="alert error">The passage has {words.toLocaleString()} words. Please keep it to {MAX_WORDS.toLocaleString()} or fewer.</div>}

          {result && (
            <AnswerCard
              result={result}
              onCopy={copyAnswer}
              onSpeak={readAloud}
              onShow={() => setView('read')}
              canShow={!!result.answerSpan}
            />
          )}

          {history.length > 0 && (
            <div className="history">
              <div className="history-head">
                <h3>📚 Question History</h3>
                <div>
                  <button className="btn small blue" onClick={saveHistory}>⬇️ Save as .txt</button>
                  <button className="btn small red" onClick={() => setHistory([])}>🗑 Clear</button>
                </div>
              </div>
              <ol>
                {history.map((h) => (
                  <li key={h.id}>
                    <b>{h.question}</b>
                    <span className="hand">{h.answer}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function ExamHeader({ section, title }) {
  return (
    <div className="exam-header">
      <div className="ribbon">{section}</div>
      <h2>{title}</h2>
      <div className="fields">
        <span>Name: <i /></span>
        <span>Date: <i /></span>
      </div>
    </div>
  );
}

function ModelPill({ model }) {
  const label =
    model.state === 'ready' ? '🟢 AI model ready (local)' : model.state === 'error' ? '🔴 Model problem' : `🟡 ${model.message}`;
  return (
    <div className={`pill ${model.state}`} title={model.message}>
      {label}
      {model.state === 'loading' && model.progress > 0 && model.progress < 100 && (
        <div className="bar"><div style={{ width: `${model.progress}%` }} /></div>
      )}
    </div>
  );
}

function WordMeter({ words, tooLong }) {
  const pct = Math.min(100, (words / MAX_WORDS) * 100);
  return (
    <div className="meter">
      <div className="track">
        <div className={`fill ${tooLong ? 'over' : pct > 80 ? 'warn' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={tooLong ? 'over-text' : ''}>
        {words.toLocaleString()} / {MAX_WORDS.toLocaleString()} words
      </span>
    </div>
  );
}

function Insights({ analysis }) {
  const { stats, keywords, names, summary } = analysis;
  return (
    <div className="insights">
      <h3>🧠 What I understood</h3>
      <div className="stats">
        <Stat n={stats.words.toLocaleString()} label="words" color="blue" />
        <Stat n={stats.sentences} label="sentences" color="green" />
        <Stat n={stats.paragraphs} label="paragraphs" color="orange" />
        <Stat n={`${stats.readingMinutes} min`} label="to read" color="pink" />
      </div>
      {keywords.length > 0 && (
        <p className="tags">
          <b>Key words:</b>{' '}
          {keywords.map((k, i) => (
            <span key={k.word} className={`tag c${i % 5}`}>{k.word} <small>×{k.count}</small></span>
          ))}
        </p>
      )}
      {names.length > 0 && (
        <p className="tags">
          <b>Names &amp; places:</b>{' '}
          {names.map((n, i) => (
            <span key={n.name} className={`tag c${(i + 2) % 5}`}>{n.name}</span>
          ))}
        </p>
      )}
      <p><b>In short:</b> <span className="hand">{summary.join(' ')}</span></p>
    </div>
  );
}

const Stat = ({ n, label, color }) => (
  <div className={`stat ${color}`}>
    <strong>{n}</strong>
    <span>{label}</span>
  </div>
);

function AnswerCard({ result, onCopy, onSpeak, onShow, canShow }) {
  const label = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }[result.confidence];
  return (
    <div className={`answer ${result.confidence}`}>
      <div className="answer-top">
        <h3>✅ Answer</h3>
        {result.kind === 'answer' && <span className={`badge ${result.confidence}`}>{label} · {Math.round(result.score * 100)}%</span>}
      </div>
      <p className="q">Q. {result.question}</p>
      {result.answer ? <p className="hand big-answer">{result.answer}</p> : <p className="hand">No answer found.</p>}
      {result.note && <p className="note">💡 {result.note}</p>}
      {result.kind === 'answer' && result.evidence && (
        <p className="evidence"><b>From the passage:</b> “{result.evidence.text}”</p>
      )}
      {result.alternatives?.length > 0 && (
        <p className="alts"><b>Other possibilities:</b> {result.alternatives.map((a) => a.answer).join(' · ')}</p>
      )}
      <div className="actions">
        <button className="btn blue small" onClick={onCopy} disabled={!result.answer}>📋 Copy</button>
        <button className="btn orange small" onClick={onShow} disabled={!canShow}>🔦 Show in Passage</button>
        <button className="btn purple small" onClick={onSpeak} disabled={!result.answer}>🔊 Read Aloud</button>
      </div>
      {result.ms != null && <small className="time">answered in {result.ms} ms, on your computer</small>}
    </div>
  );
}

/** Renders the passage with the supporting sentence (yellow) and exact answer (green) highlighted. */
function Highlighted({ text, result, markRef }) {
  const span = result?.answerSpan;
  if (!span) return <>{text}</>;
  const ev = result.evidence && result.kind !== 'yesno' ? result.evidence : span;
  const evStart = Math.min(ev.start, span.start);
  const evEnd = Math.max(ev.end, span.end);
  return (
    <>
      {text.slice(0, evStart)}
      <mark className="evidence-mark">
        {text.slice(evStart, span.start)}
        <mark className="answer-mark" ref={markRef}>{text.slice(span.start, span.end)}</mark>
        {text.slice(span.end, evEnd)}
      </mark>
      {text.slice(evEnd)}
    </>
  );
}
