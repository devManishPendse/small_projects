// Quick self-test: `npm test -w server` (starts the model, asks questions about a sample passage).
import { loadModel, answerQuestion, status } from './qa.js';
import { analyze, countWords } from './nlp.js';

const passage = `The Apollo 11 mission was launched on July 16, 1969, from Kennedy Space Center in Florida. Three astronauts were on board: Neil Armstrong, Buzz Aldrin, and Michael Collins. Armstrong was the commander of the mission. Collins stayed in orbit around the Moon in the command module called Columbia, while Armstrong and Aldrin descended to the lunar surface in the lunar module named Eagle.

On July 20, 1969, Armstrong became the first person to walk on the Moon. As he stepped onto the surface, he said, "That's one small step for man, one giant leap for mankind." Aldrin joined him about nineteen minutes later. Together they spent roughly two and a half hours outside the spacecraft, collecting rock samples and setting up scientific experiments. They also planted an American flag and left a plaque that read, "We came in peace for all mankind."

The astronauts returned to Earth on July 24, 1969, splashing down in the Pacific Ocean. The USS Hornet picked them up. After landing they were kept in quarantine for 21 days, because scientists worried the Moon might carry unknown germs. The mission fulfilled the goal set by President John F. Kennedy in 1961, who had promised to land a man on the Moon before the end of the decade.`;

const cases = [
  ['Who was the commander of the mission?', 'Armstrong'],
  ['When was Apollo 11 launched?', 'July 16, 1969'],
  ['What was the name of the lunar module?', 'Eagle'],
  ['How long were the astronauts in quarantine?', '21 days'],
  ['Which ship picked up the astronauts?', 'USS Hornet'],
  ['Where did the astronauts splash down?', 'Pacific Ocean'],
  ['Who stayed in orbit around the Moon?', 'Collins'],
  ['Why were the astronauts quarantined?', 'germs'],
  ['What did the plaque say?', 'We came in peace for all mankind'],
  ['Who promised to land a man on the Moon?', 'Kennedy'],
];

// Build a long (~10,000 word) document by padding with unrelated text, to test retrieval at scale.
const filler = `The rainforest is home to millions of species of plants, insects, and animals. Rainfall in the Amazon basin can exceed two meters per year. Farmers in the valley grow wheat, barley, and sunflowers, and sell them at the weekly market. `;
const big = (filler.repeat(100) + passage + '\n\n' + filler.repeat(100)).trim();

console.log(`Analyze: ${JSON.stringify(analyze(passage).stats)}`);
await loadModel();
if (status.state !== 'ready') {
  console.error(status.message);
  process.exit(1);
}

let pass = 0;
let total = 0;
for (const [label, text] of [['short', passage], [`long (${countWords(big)} words)`, big]]) {
  console.log(`\n=== ${label} ===`);
  for (const [q, expected] of cases) {
    const r = await answerQuestion(text, q);
    const ok = r.answer.toLowerCase().includes(expected.toLowerCase());
    total++;
    if (ok) pass++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${q}  ->  "${r.answer}" (${r.confidence} ${r.score}, ${r.ms}ms)`);
  }
}
const yn = await answerQuestion(passage, 'Did Armstrong walk on the Moon?');
console.log('\nYes/No:', yn.kind, '|', yn.answer);
const sm = await answerQuestion(passage, 'What is this passage about?');
console.log('Summary:', sm.kind, '|', sm.answer);
console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
