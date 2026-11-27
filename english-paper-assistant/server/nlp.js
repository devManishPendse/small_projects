// Lightweight text-processing helpers (no AI model needed here):
// sentence splitting, chunking, BM25 retrieval, summary and keyword extraction.

export const MAX_WORDS = 10000;

const STOP = new Set(
  `a about above after again against all am an and any are aren't as at be because been before being below between both but by
can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't
have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't
it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own
same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's
these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were
weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're
you've your yours yourself yourselves also however thus within without upon among per via may might must shall will just yet still
many much one two three first second new us s t`.split(/\s+/)
);

const ABBR =
  /^(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|Inc|Ltd|Co|Fig|approx|Gen|Col|Lt|Sgt|Mt|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|e\.g|i\.e|U\.S|U\.K|a\.m|p\.m|etc)$/;

export function countWords(text) {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/** Splits text into sentences, keeping character offsets into the original text. */
export function splitSentences(text) {
  const out = [];
  const push = (from, to) => {
    const slice = text.slice(from, to);
    const lead = slice.length - slice.trimStart().length;
    const trimmed = slice.trim();
    if (trimmed) out.push({ text: trimmed, start: from + lead, end: from + lead + trimmed.length });
  };

  let start = 0;
  const re = /([.!?]+["'”’)\]]*)(\s+|$)|(\n\s*\n)/g;
  let m;
  while ((m = re.exec(text))) {
    const end = m.index + (m[1] ? m[1].length : 0);
    if (m[1]) {
      const before = text.slice(start, m.index);
      const lastWord = (before.match(/([A-Za-z.]+)$/) || [])[1] || '';
      const nextChar = text[re.lastIndex] || '';
      const isAbbr = ABBR.test(lastWord) || /^[A-Z]$/.test(lastWord);
      if (m[1] === '.' && (isAbbr || /[a-z]/.test(nextChar))) continue;
    }
    push(start, end);
    start = re.lastIndex;
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  push(start, text.length);
  return out;
}

export function stem(word) {
  let w = word.toLowerCase();
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function contentTokens(text) {
  const words = text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
  return words.filter((w) => !STOP.has(w) && w.length > 1).map(stem);
}

/**
 * Groups sentences into overlapping chunks small enough for the QA model
 * (which reads ~512 tokens at a time). Offsets point into the original text.
 */
export function makeChunks(text, sentences, maxWords = 170, overlapWords = 35) {
  // Break up giant "sentences" (e.g. text with no punctuation) so they fit.
  const units = [];
  for (const s of sentences) {
    const words = [...s.text.matchAll(/\S+/g)];
    if (words.length <= maxWords) {
      units.push({ start: s.start, end: s.end, words: words.length });
    } else {
      for (let i = 0; i < words.length; i += maxWords) {
        const first = words[i];
        const last = words[Math.min(i + maxWords, words.length) - 1];
        units.push({
          start: s.start + first.index,
          end: s.start + last.index + last[0].length,
          words: Math.min(maxWords, words.length - i),
        });
      }
    }
  }

  const chunks = [];
  let i = 0;
  while (i < units.length) {
    let j = i;
    let words = 0;
    while (j < units.length && (words + units[j].words <= maxWords || j === i)) {
      words += units[j].words;
      j++;
    }
    chunks.push(makeChunk(text, units[i].start, units[j - 1].end));
    if (j >= units.length) break;
    // step back so neighbouring chunks share a few sentences (answers on a boundary aren't lost)
    let back = j;
    let overlap = 0;
    while (back - 1 > i && overlap + units[back - 1].words <= overlapWords) {
      back--;
      overlap += units[back].words;
    }
    i = back;
  }
  return chunks;
}

function makeChunk(text, start, end) {
  // Whitespace -> plain spaces keeps character offsets identical to the original.
  return { start, end, text: text.slice(start, end).replace(/\s/g, ' ') };
}

/** BM25 relevance of every chunk to the question. Returns an array of scores. */
export function bm25(chunks, question) {
  const q = [...new Set(contentTokens(question))];
  if (!q.length) return chunks.map(() => 0);
  const docs = chunks.map((c) => contentTokens(c.text));
  const N = docs.length;
  const avgLen = docs.reduce((a, d) => a + d.length, 0) / (N || 1) || 1;
  const df = new Map();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
  const k1 = 1.5;
  const b = 0.75;
  return docs.map((d) => {
    const tf = new Map();
    for (const t of d) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const t of q) {
      const f = tf.get(t) || 0;
      if (!f) continue;
      const n = df.get(t) || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgLen));
    }
    return score;
  });
}

/** Finds where `answer` sits inside `chunk` (tolerates the tokenizer changing spacing). */
export function locateAnswer(chunk, answer) {
  const direct = chunk.text.indexOf(answer);
  if (direct >= 0) return { start: chunk.start + direct, end: chunk.start + direct + answer.length };
  const lower = chunk.text.toLowerCase().indexOf(answer.toLowerCase());
  if (lower >= 0) return { start: chunk.start + lower, end: chunk.start + lower + answer.length };
  const chars = answer.replace(/\s+/g, '');
  if (!chars) return null;
  const pattern = [...chars].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
  const m = new RegExp(pattern, 'i').exec(chunk.text);
  return m ? { start: chunk.start + m.index, end: chunk.start + m.index + m[0].length } : null;
}

export function sentenceAt(sentences, pos) {
  return sentences.find((s) => pos >= s.start && pos < s.end) || null;
}

// ---------------------------------------------------------------- analysis

export function keywords(text, limit = 10) {
  const counts = new Map();
  const forms = new Map();
  for (const w of text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []) {
    if (STOP.has(w) || w.length < 3) continue;
    const s = stem(w);
    counts.set(s, (counts.get(s) || 0) + 1);
    const f = forms.get(s) || new Map();
    f.set(w, (f.get(w) || 0) + 1);
    forms.set(s, f);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([s, count]) => ({
      word: [...forms.get(s).entries()].sort((a, b) => b[1] - a[1])[0][0],
      count,
    }));
}

/** Capitalised names / places that are not just the first word of a sentence. */
export function namedThings(sentences, limit = 8) {
  const counts = new Map();
  const skip = new Set(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'I', 'The', 'A', 'An', 'In', 'On', 'At', 'It', 'He', 'She', 'They', 'We', 'This', 'That', 'These', 'Those']);
  for (const s of sentences) {
    const afterFirst = s.text.replace(/^\S+\s*/, '');
    for (const m of afterFirst.matchAll(/\b([A-Z][a-z]+(?:\s+(?:of\s+|the\s+)?[A-Z][a-z]+)*)\b/g)) {
      const name = m[1];
      if (skip.has(name)) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

/** Extractive summary: picks the sentences that carry the most frequent ideas. */
export function summarize(sentences, count) {
  if (sentences.length <= count) return sentences.map((s) => s.text);
  const freq = new Map();
  const toks = sentences.map((s) => contentTokens(s.text));
  for (const t of toks) for (const w of t) freq.set(w, (freq.get(w) || 0) + 1);
  const scored = sentences.map((s, i) => {
    const t = toks[i];
    if (t.length < 4) return { i, score: 0 };
    const sum = t.reduce((a, w) => a + freq.get(w), 0);
    const position = i === 0 ? 1.3 : i < sentences.length * 0.15 ? 1.1 : 1;
    return { i, score: (sum / Math.sqrt(t.length)) * position };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .sort((a, b) => a.i - b.i)
    .map((x) => sentences[x.i].text);
}

export function analyze(text) {
  const sentences = splitSentences(text);
  const words = countWords(text);
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const summaryCount = Math.max(2, Math.min(8, Math.round(sentences.length / 8)));
  return {
    stats: {
      words,
      sentences: sentences.length,
      paragraphs,
      characters: text.length,
      avgSentenceLength: sentences.length ? Math.round((words / sentences.length) * 10) / 10 : 0,
      readingMinutes: Math.max(1, Math.round(words / 200)),
    },
    keywords: keywords(text),
    names: namedThings(sentences),
    summary: summarize(sentences, summaryCount),
  };
}

export const SUMMARY_QUESTION =
  /\b(summari[sz]e|summary|main idea|central idea|gist|overview|in short|what is (this|the) (paragraph|passage|text|paper|article|essay|story) (all )?about|what does (this|the) (paragraph|passage|text|paper|article|essay|story) (say|describe|discuss)|theme of)\b/i;

export const YES_NO_QUESTION =
  /^\s*(is|are|was|were|do|does|did|can|could|will|would|has|have|had|should|shall|may|might|must)\b(?!.*\b(or)\b)/i;
