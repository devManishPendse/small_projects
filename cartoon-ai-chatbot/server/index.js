import 'dotenv/config';
import { createStore } from './store.js';
import { createApp } from './app.js';
import { hasApiKey, MODEL } from './llm.js';

const PORT = Number(process.env.PORT) || 3001;

createApp(createStore()).listen(PORT, () => {
  console.log(`\n🎈 Bubbles API ready on http://localhost:${PORT}`);
  console.log(
    hasApiKey()
      ? `   Mode: Claude (${MODEL})`
      : '   Mode: DEMO (no ANTHROPIC_API_KEY found - replies are canned). Add a key to server/.env for real answers.',
  );
});
