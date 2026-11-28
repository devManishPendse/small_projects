import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { titleFrom } from './store.js';
import { streamReply, friendlyError, hasApiKey, MODEL } from './llm.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAX_MESSAGE_CHARS = 8000;

export function createApp(store) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mode: hasApiKey() ? 'claude' : 'demo', model: hasApiKey() ? MODEL : null });
  });

  // ---- conversation history ----
  app.get('/api/conversations', (_req, res) => res.json(store.list()));

  app.post('/api/conversations', (_req, res) => res.status(201).json(store.create()));

  app.get('/api/conversations/:id', (req, res) => {
    const convo = store.get(req.params.id);
    return convo ? res.json(convo) : res.status(404).json({ error: 'Conversation not found' });
  });

  app.patch('/api/conversations/:id', (req, res) => {
    const title = String(req.body?.title ?? '').trim().slice(0, 80);
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const convo = store.rename(req.params.id, title);
    return convo ? res.json(convo) : res.status(404).json({ error: 'Conversation not found' });
  });

  app.delete('/api/conversations/:id', (req, res) =>
    store.remove(req.params.id) ? res.status(204).end() : res.status(404).json({ error: 'Conversation not found' }),
  );

  // ---- streaming chat (Server-Sent Events over POST) ----
  app.post('/api/conversations/:id/messages', async (req, res) => {
    const convo = store.get(req.params.id);
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });

    const content = String(req.body?.content ?? '').trim();
    if (!content) return res.status(400).json({ error: 'Message is empty' });
    if (content.length > MAX_MESSAGE_CHARS) {
      return res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_CHARS} characters)` });
    }

    const isFirstMessage = convo.messages.length === 0;
    const userMessage = store.addMessage(convo.id, 'user', content);
    if (isFirstMessage) store.rename(convo.id, titleFrom(content));

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    // If the browser disconnects (Stop button / closed tab) cancel the upstream request.
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });

    send('start', { userMessage, title: store.get(convo.id).title });

    let reply = '';
    try {
      for await (const text of streamReply(store.get(convo.id).messages, abort.signal)) {
        reply += text;
        send('token', { text });
      }
    } catch (err) {
      if (!abort.signal.aborted) {
        console.error('[chat] stream failed:', err?.message ?? err);
        send('error', { message: friendlyError(err) });
      }
    }

    // Keep whatever was generated, even a partial reply from a stopped stream.
    const assistantMessage = reply.trim() ? store.addMessage(convo.id, 'assistant', reply) : null;
    if (!res.writableEnded && !abort.signal.aborted) {
      send('done', { message: assistantMessage });
    }
    res.end();
  });

  // ---- serve the built React app in production (`npm start`) ----
  const dist = path.resolve(here, '../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  return app;
}
