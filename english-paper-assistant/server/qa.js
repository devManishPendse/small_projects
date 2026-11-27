// Local question answering: loads a small AI model once, then answers questions
// by (1) finding the most relevant parts of the paragraph and (2) letting the
// model pick the exact answer span from them.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';
import {
  splitSentences,
  makeChunks,
  bm25,
  locateAnswer,
  sentenceAt,
  contentTokens,
  summarize,
  SUMMARY_QUESTION,
  YES_NO_QUESTION,
} from './nlp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
env.cacheDir = path.join(__dirname, 'models'); // model is stored in the project folder

export const MODEL = process.env.QA_MODEL || 'Xenova/distilbert-base-cased-distilled-squad';
const TOP_CHUNKS = 6;

export const status = { state: 'loading', model: MODEL, progress: 0, message: 'Starting…' };
let qa = null;
let queue = Promise.resolve(); // runs one model call at a time

export async function loadModel() {
  status.state = 'loading';
  status.message = 'Loading the local AI model (first run downloads it once, ~65 MB)…';
  try {
    qa = await pipeline('question-answering', MODEL, {
      dtype: 'q8',
      progress_callback: (p) => {
        if (p.status === 'progress' && typeof p.progress === 'number') {
          status.progress = Math.round(p.progress);
          status.message = `Downloading model… ${status.progress}%`;
        } else if (p.status === 'ready') {
          status.progress = 100;
        }
      },
    });
    status.state = 'ready';
    status.progress = 100;
    status.message = 'Model ready — running fully on your computer.';
  } catch (err) {
    status.state = 'error';
    status.message = `Could not load the model: ${err.message}. Check your internet connection for the first run, then restart.`;
    console.error(err);
  }
}

function runQa(question, context) {
  const job = queue.then(() => qa(question, context, { top_k: 5 }));
  queue = job.catch(() => {});
  return job;
}

const confidenceLabel = (s) => (s >= 0.5 ? 'high' : s >= 0.2 ? 'medium' : 'low');

export function summaryAnswer(text) {
  const sentences = splitSentences(text);
  const count = Math.max(2, Math.min(6, Math.round(sentences.length / 8)));
  return {
    kind: 'summary',
    answer: summarize(sentences, count).join(' '),
    confidence: 'high',
    score: 1,
    note: 'This looks like a "what is it about" question, so here is a summary of the whole paragraph.',
  };
}

export async function answerQuestion(text, question) {
  if (!qa) throw new Error('The AI model is not ready yet.');
  const started = Date.now();

  if (SUMMARY_QUESTION.test(question)) {
    return { ...summaryAnswer(text), ms: Date.now() - started };
  }

  const sentences = splitSentences(text);
  const chunks = makeChunks(text, sentences);
  const rel = bm25(chunks, question);
  const maxRel = Math.max(...rel, 0);

  // Pass 1: the most relevant chunks (or spread evenly if the question has no usable keywords).
  let order = chunks.map((_, i) => i);
  if (maxRel > 0) order.sort((a, b) => rel[b] - rel[a]);
  const contexts = order
    .slice(0, TOP_CHUNKS)
    .map((ci) => ({ chunk: chunks[ci], relNorm: maxRel > 0 ? rel[ci] / maxRel : 0.5 }));

  // Pass 2: tight "focus" contexts around the best-matching sentences. Small models answer more
  // precisely when they only see the sentence that matters (plus its neighbours).
  const sentRel = bm25(sentences, question);
  const maxSent = Math.max(...sentRel, 0);
  if (maxSent > 0) {
    const seen = new Set(contexts.map((c) => `${c.chunk.start}-${c.chunk.end}`));
    const topSent = sentences
      .map((_, i) => i)
      .sort((a, b) => sentRel[b] - sentRel[a])
      .slice(0, 2);
    for (const i of topSent) {
      const relNorm = sentRel[i] / maxSent;
      for (const [from, to] of [[i, i], [Math.max(0, i - 1), Math.min(sentences.length - 1, i + 1)]]) {
        const start = sentences[from].start;
        const end = sentences[to].end;
        const key = `${start}-${end}`;
        if (seen.has(key) || end - start > 2500) continue;
        seen.add(key);
        contexts.push({
          chunk: { start, end, text: text.slice(start, end).replace(/\s/g, ' ') },
          relNorm,
        });
      }
    }
  }

  const qTokens = new Set(contentTokens(question));
  const candidates = [];
  for (const { chunk, relNorm } of contexts) {
    let results = await runQa(question, chunk.text);
    if (!Array.isArray(results)) results = [results];
    for (const r of results) {
      const answer = (r.answer || '').trim();
      if (!answer) continue;
      // Re-rank: an answer whose sentence mentions the question's keywords is more trustworthy.
      const span = locateAnswer(chunk, answer);
      const sent = span && sentenceAt(sentences, span.start);
      let overlap = 0.5;
      if (sent && qTokens.size) {
        const have = new Set(contentTokens(sent.text));
        overlap = [...qTokens].filter((t) => have.has(t)).length / qTokens.size;
      }
      candidates.push({
        answer,
        score: r.score,
        rank: r.score * (0.6 + 0.4 * relNorm) * (0.4 + overlap),
        chunk,
      });
    }
  }
  candidates.sort((a, b) => b.rank - a.rank);

  if (!candidates.length) {
    return {
      kind: 'none',
      answer: '',
      confidence: 'low',
      score: 0,
      note: 'I could not find an answer to that in the paragraph.',
      ms: Date.now() - started,
    };
  }

  const best = candidates[0];
  const span = locateAnswer(best.chunk, best.answer);
  const evidence = span ? sentenceAt(sentences, span.start) : null;

  // Other plausible answers (different text, from anywhere in the paragraph).
  const seen = new Set([best.answer.toLowerCase()]);
  const alternatives = [];
  for (const c of candidates.slice(1)) {
    const key = c.answer.toLowerCase();
    if (seen.has(key) || c.score < 0.15) continue;
    seen.add(key);
    alternatives.push({ answer: c.answer, score: Math.round(c.score * 100) / 100 });
    if (alternatives.length === 3) break;
  }

  const result = {
    kind: 'answer',
    answer: best.answer,
    score: Math.round(best.score * 100) / 100,
    confidence: confidenceLabel(best.score),
    answerSpan: span,
    evidence: evidence && { text: evidence.text, start: evidence.start, end: evidence.end },
    alternatives,
    ms: Date.now() - started,
  };

  if (best.score < 0.08) {
    result.note =
      'I am not confident about this. The paragraph may not contain the answer — check the highlighted sentence.';
  }

  // Yes/No questions: an extractive model finds facts, not "yes"/"no" — be honest and show the evidence.
  if (YES_NO_QUESTION.test(question) && maxSent > 0) {
    const top = sentences[sentRel.indexOf(maxSent)];
    result.kind = 'yesno';
    result.answer = top.text;
    result.answerSpan = { start: top.start, end: top.end };
    result.evidence = { text: top.text, start: top.start, end: top.end };
    result.note =
      'This is a yes/no question. Read the highlighted sentence from the paragraph to decide — it is the closest statement I found.';
  }

  return result;
}

export { contentTokens };
