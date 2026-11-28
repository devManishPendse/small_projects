// Tiny JSON-file conversation store. Good enough for a local demo; swap for a DB later.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createStore(file = path.join(here, 'data', 'conversations.json')) {
  let conversations = [];

  try {
    conversations = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    conversations = []; // first run or unreadable file -> start fresh
  }

  function persist() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(conversations, null, 2));
    fs.renameSync(tmp, file); // atomic swap so a crash can't corrupt history
  }

  const summary = (c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt,
    messageCount: c.messages.length,
  });

  return {
    list() {
      return conversations
        .map(summary)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    get(id) {
      return conversations.find((c) => c.id === id) ?? null;
    },

    create(title = 'New chat') {
      const now = new Date().toISOString();
      const convo = { id: randomUUID(), title, createdAt: now, updatedAt: now, messages: [] };
      conversations.push(convo);
      persist();
      return convo;
    },

    rename(id, title) {
      const convo = this.get(id);
      if (!convo) return null;
      convo.title = title;
      convo.updatedAt = new Date().toISOString();
      persist();
      return convo;
    },

    remove(id) {
      const before = conversations.length;
      conversations = conversations.filter((c) => c.id !== id);
      if (conversations.length !== before) persist();
      return conversations.length !== before;
    },

    addMessage(id, role, content) {
      const convo = this.get(id);
      if (!convo) return null;
      const message = {
        id: randomUUID(),
        role,
        content,
        createdAt: new Date().toISOString(),
      };
      convo.messages.push(message);
      convo.updatedAt = message.createdAt;
      persist();
      return message;
    },
  };
}

export function titleFrom(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 40 ? `${clean.slice(0, 40).trimEnd()}…` : clean || 'New chat';
}
