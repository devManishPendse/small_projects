import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyze, countWords, MAX_WORDS } from './nlp.js';
import { answerQuestion, summaryAnswer, loadModel, status } from './qa.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const app = express();

app.use(express.json({ limit: '5mb' }));

function validateText(text, res) {
  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'Please paste a paragraph first.' });
    return false;
  }
  const words = countWords(text);
  if (words > MAX_WORDS) {
    res.status(400).json({ error: `The paragraph has ${words} words. The limit is ${MAX_WORDS}.` });
    return false;
  }
  return true;
}

app.get('/api/status', (_req, res) => res.json({ ...status, maxWords: MAX_WORDS }));

app.post('/api/analyze', (req, res) => {
  const { text } = req.body || {};
  if (!validateText(text, res)) return;
  res.json(analyze(text));
});

app.post('/api/summarize', (req, res) => {
  const { text } = req.body || {};
  if (!validateText(text, res)) return;
  res.json(summaryAnswer(text));
});

app.post('/api/ask', async (req, res) => {
  const { text, question } = req.body || {};
  if (!validateText(text, res)) return;
  if (typeof question !== 'string' || question.trim().length < 2) {
    return res.status(400).json({ error: 'Please type a question.' });
  }
  if (status.state !== 'ready') {
    return res.status(503).json({ error: status.message });
  }
  try {
    res.json(await answerQuestion(text, question.trim()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong while answering. Please try again.' });
  }
});

// Serve the built React app (created by `npm run build`).
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`\n  English Paper Assistant is running → http://localhost:${PORT}\n`);
  loadModel().then(() => console.log(`  ${status.message}`));
});
