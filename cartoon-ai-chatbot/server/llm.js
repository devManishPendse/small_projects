// Streams a reply for a conversation. Two backends:
//   - Claude (when ANTHROPIC_API_KEY is set)
//   - Demo mode (no key): canned replies streamed word by word so the UI is fully testable offline.
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.CLAUDE_EFFORT || 'low';

export const SYSTEM_PROMPT = `You are Bubbles, a cheerful cartoon robot buddy who lives inside a chat window.
Be warm, playful and concise. Sprinkle in an occasional emoji or comic-style exclamation ("Zoink!", "Ta-da!"),
but never let the fun get in the way of a clear, correct answer. Use Markdown (lists, code blocks) when it helps.`;

export const hasApiKey = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client; // created lazily so demo mode never touches the SDK
const getClient = () => (client ??= new Anthropic());

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const done = () => { clearTimeout(t); signal?.removeEventListener('abort', done); resolve(); };
    const t = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });

/**
 * @param {{role: 'user'|'assistant', content: string}[]} history
 * @param {AbortSignal} signal
 * @returns {AsyncGenerator<string>} text deltas
 */
export function streamReply(history, signal) {
  return hasApiKey() ? streamFromClaude(history, signal) : streamDemo(history, signal);
}

async function* streamFromClaude(history, signal) {
  const stream = getClient().messages.stream(
    {
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { effort: EFFORT },
      messages: history.map(({ role, content }) => ({ role, content })),
    },
    { signal },
  );

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }

  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') {
    yield "\n\nOops! I can't help with that one. Want to try asking something else? 🎈";
  }
}

async function* streamDemo(history, signal) {
  const last = history[history.length - 1]?.content ?? '';
  const reply =
    `Zoink! I'm **Bubbles**, running in *demo mode* because no \`ANTHROPIC_API_KEY\` is set. 🎈\n\n` +
    `You said: “${last.slice(0, 200)}”\n\n` +
    `Here's what I can show off right now:\n` +
    `- Streaming replies, word by word\n` +
    `- Saved conversation history in the sidebar\n` +
    `- A big red **Stop** button\n\n` +
    `Add your key to \`server/.env\` and restart to chat with the real Claude. Ta-da! ✨`;

  for (const word of reply.split(/(\s+)/)) {
    if (signal?.aborted) return;
    yield word;
    await sleep(35, signal);
  }
}

/** Turns SDK / network errors into something friendly to show in a speech bubble. */
export function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'My API key was rejected. Check ANTHROPIC_API_KEY in server/.env.';
  if (err instanceof Anthropic.RateLimitError) return "I'm getting too many requests right now. Give me a moment and try again!";
  if (err instanceof Anthropic.BadRequestError) return `The API didn't like that request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "I can't reach the Claude API. Is your internet connection okay?";
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status ?? '?'}). Please try again.`;
  return 'Something went wrong on my side. Please try again.';
}
