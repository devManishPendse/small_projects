// Run with: npm test   (uses Node's built-in test runner, no extra deps; always uses demo mode)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { createStore } = await import('./store.js');
const { createApp } = await import('./app.js');

let server, base, tmp;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bubbles-'));
  const app = createApp(createStore(path.join(tmp, 'c.json')));
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://localhost:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const json = (url, opts) => fetch(base + url, opts);

test('health reports demo mode without a key', async () => {
  const body = await (await json('/api/health')).json();
  assert.equal(body.mode, 'demo');
});

test('streams a reply as SSE tokens, then saves history', async () => {
  const { id } = await (await json('/api/conversations', { method: 'POST' })).json();

  const res = await json(`/api/conversations/${id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'Hello robot' }),
  });
  assert.equal(res.headers.get('content-type'), 'text/event-stream');

  const raw = await res.text();
  const events = raw.trim().split('\n\n').map((b) => b.split('\n')[0].replace('event: ', ''));
  assert.equal(events[0], 'start');
  assert.ok(events.filter((e) => e === 'token').length > 5, 'should stream many token events');
  assert.equal(events.at(-1), 'done');

  const convo = await (await json(`/api/conversations/${id}`)).json();
  assert.equal(convo.title, 'Hello robot');
  assert.deepEqual(convo.messages.map((m) => m.role), ['user', 'assistant']);
  assert.match(convo.messages[1].content, /Bubbles/);

  const list = await (await json('/api/conversations')).json();
  assert.equal(list.length, 1);
});

test('rejects empty messages and unknown conversations', async () => {
  const { id } = await (await json('/api/conversations', { method: 'POST' })).json();
  const empty = await json(`/api/conversations/${id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '   ' }),
  });
  assert.equal(empty.status, 400);
  assert.equal((await json('/api/conversations/nope')).status, 404);
});

test('rename and delete a conversation', async () => {
  const { id } = await (await json('/api/conversations', { method: 'POST' })).json();
  const renamed = await (await json(`/api/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Renamed' }),
  })).json();
  assert.equal(renamed.title, 'Renamed');
  assert.equal((await json(`/api/conversations/${id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await json(`/api/conversations/${id}`)).status, 404);
});
