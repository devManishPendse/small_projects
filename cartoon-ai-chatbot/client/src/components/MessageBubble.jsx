import ReactMarkdown from 'react-markdown';
import Mascot from './Mascot.jsx';

export default function MessageBubble({ message, streaming }) {
  const isUser = message.role === 'user';
  const waiting = streaming && !message.content;

  return (
    <div className={`row ${isUser ? 'row-user' : 'row-bot'}`}>
      {!isUser && <Mascot size={44} mood={streaming ? (waiting ? 'thinking' : 'talking') : 'idle'} />}
      <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-bot'} ${message.error ? 'bubble-error' : ''}`}>
        {waiting ? (
          <span className="dots" aria-label="Bubbles is thinking">
            <i /><i /><i />
          </span>
        ) : isUser ? (
          <p className="plain">{message.content}</p>
        ) : (
          <ReactMarkdown>{message.content}</ReactMarkdown>
        )}
        {streaming && message.content && <span className="caret" />}
      </div>
    </div>
  );
}
