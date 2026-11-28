import { useRef, useState } from 'react';

export default function Composer({ streaming, onSend, onStop }) {
  const [text, setText] = useState('');
  const ref = useRef(null);

  const submit = () => {
    const value = text.trim();
    if (!value || streaming) return;
    onSend(value);
    setText('');
    if (ref.current) ref.current.style.height = 'auto';
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onInput = (e) => {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  };

  return (
    <div className="composer">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        placeholder="Type a message for Bubbles…  (Enter to send, Shift+Enter for a new line)"
        onChange={onInput}
        onKeyDown={onKeyDown}
        maxLength={8000}
        autoFocus
      />
      {streaming ? (
        <button className="btn btn-stop" onClick={onStop}>■ Stop</button>
      ) : (
        <button className="btn btn-send" onClick={submit} disabled={!text.trim()}>Send 🚀</button>
      )}
    </div>
  );
}
