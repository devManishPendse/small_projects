async function request(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

const jsonBody = (method, data) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

export const api = {
  health: () => request('/api/health'),
  listConversations: () => request('/api/conversations'),
  getConversation: (id) => request(`/api/conversations/${id}`),
  createConversation: () => request('/api/conversations', { method: 'POST' }),
  renameConversation: (id, title) => request(`/api/conversations/${id}`, jsonBody('PATCH', { title })),
  deleteConversation: (id) => request(`/api/conversations/${id}`, { method: 'DELETE' }),
};

/**
 * Sends a message and reads the reply as a stream of Server-Sent Events.
 * (EventSource can't POST, so we parse the SSE frames from fetch's ReadableStream.)
 * Handlers: onStart({userMessage,title}), onToken(text), onDone(), onError(message)
 */
export async function streamMessage(conversationId, content, { signal, onStart, onToken, onDone, onError }) {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    ...jsonBody('POST', { content }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (frame) => {
    let event = 'message';
    let data = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data += line.slice(6);
    }
    if (!data) return;
    const payload = JSON.parse(data);
    if (event === 'start') onStart?.(payload);
    else if (event === 'token') onToken?.(payload.text);
    else if (event === 'done') onDone?.(payload);
    else if (event === 'error') onError?.(payload.message);
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      dispatch(buffer.slice(0, end));
      buffer = buffer.slice(end + 2);
    }
  }
}
