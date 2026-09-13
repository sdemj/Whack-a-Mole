const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
function source(name) {
  const start = script.indexOf(`function ${name}(`);
  const end = script.indexOf('\nfunction ', start + 1);
  return script.slice(start, end < 0 ? undefined : end);
}
const bank = JSON.parse(script.match(/const WORD_BANK = (.*);/)[1]);
const context = vm.createContext({Math, state: {}, pool: []});
vm.runInContext('function selectedPool(){return pool}', context);
for (const name of ['shuffle', 'sample', 'makeSpellingVariants', 'buildOptions']) {
  vm.runInContext(source(name), context);
}
let checks = 0;
for (const category of bank) for (const sub of category.subcategories) {
  context.pool = sub.words;
  for (const mode of ['word', 'spelling']) {
    context.state.mode = mode;
    for (const word of sub.words) for (let repeat = 0; repeat < 20; repeat++) {
      const options = context.buildOptions(word);
      assert.equal(options.length, 6, `${sub.name}: ${word.en}`);
      assert.equal(options.filter(o => o.correct).length, 1);
      assert.equal(new Set(options.map(o => o.text.toLowerCase())).size, 6);
      checks++;
    }
  }
}
const buttons = Array.from({length: 6}, () => ({
  dataset: {}, classList: {add(){}, remove(){}},
  setAttribute(){}, querySelector(){return this.label}, label: {}
}));
Object.assign(context, {
  $: () => ({}), $$: () => buttons, ensureMoleSlots(){}, fitAllWordBoards(){},
  requestAnimationFrame: fn => fn(), delay: fn => context.queue.push(fn), queue: [],
  DIFFICULTIES: {normal: {exposure: 5000}}
});
for (const name of ['placeOptions', 'setMoleOption', 'startMoleCycle']) vm.runInContext(source(name), context);
Object.assign(context.state, {gameActive: true, paused: false, lock: false, difficulty: 'normal',
  options: Array.from({length: 6}, (_, i) => ({text: `word${i}`, correct: i === 0}))});
context.placeOptions();
for (let cycle = 0; cycle < 1000; cycle++) {
  assert.equal(new Set(buttons.map(b => b.dataset.optionIndex)).size, 6);
  assert.equal(buttons.filter(b => b.dataset.correct === 'true').length, 1);
  context.queue.shift()();
  context.queue.shift()();
}
context.state.lock = true;
context.queue.shift()();
context.state.lock = false;
context.queue.shift()();
assert.equal(context.queue.length, 1, 'Cycle must continue after wrong-answer feedback');
console.log(`Passed: script syntax, ${checks} option sets, 1000 appearance cycles, wrong-answer recovery.`);
