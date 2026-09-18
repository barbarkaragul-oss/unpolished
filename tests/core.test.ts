import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { clean, addedText } from '../src/core/clean';
import { redPen, corrections } from '../src/core/diff';
import { scan, added, level } from '../src/core/scan';
import { systemPrompt } from '../src/core/prompt';
import { fix } from '../src/core/fix';
import { DEFAULTS } from '../src/settings';
import type { Engine } from '../src/engines/types';
import tells from '../src/vendor/tells.json';

const ROUGH = 'hi everyone. i am solo dev from turkey and my english is not good sorry. i build small tool that show you why your github action not run.';
const SLOP = "In today's fast-paced world, it is crucial to leverage the right tools. Let me delve into how this works. It is fast, reliable, and scalable. Moreover, it's important to note that it is free — and open source.";

test('clean takes off what small models wrap the answer in, and keeps the writer\'s own spacing', () => {
  assert.equal(clean('Here is the corrected text:\nHello there.', 'hello there.'), 'Hello there.');
  assert.equal(clean('Sure! Here you go: Hello there.', 'hello there.'), 'Hello there.');
  assert.equal(clean('"Hello there."', 'hello there.'), 'Hello there.');
  assert.equal(clean('<think>let me see</think>\nHello there.', 'hello there.'), 'Hello there.');
  assert.equal(clean('```\nHello there.\n```', 'hello there.'), 'Hello there.');
  assert.equal(clean('Hello there.', '  hello there.\n'), '  Hello there.\n');
  assert.equal(clean('"Quoted," she said.', '"quoted," she said.'), '"Quoted," she said.', 'a quote the writer opened with stays');
});

test('addedText catches a model that writes more than it was asked to correct', () => {
  assert.equal(addedText(ROUGH, 'Hi everyone. I am a solo dev from Turkey and my English is not good, sorry. I built a small tool that shows you why your GitHub Action did not run.'), false);
  assert.equal(addedText('i made a tool.', 'I made a tool. It is fast and free. Everyone should try it today. You will love it.'), true);
});

test('fix retries once with a stricter prompt when text was added, and says so when it still was', async () => {
  const calls: string[] = [];
  const engine = (answers: string[]): Engine => ({
    id: 'ollama', label: 'fake', where: 'local-server',
    availability: async () => 'ready',
    correct: async (_t, ask, _s, onText) => { calls.push(ask.system); const a = answers.shift()!; onText(a); return a; },
  });
  const signal = new AbortController().signal;
  const padded = 'I made a tool. It is fast and free. Everyone should try it today. You will love it.';
  const ok = await fix('i made a tool.', engine([padded, 'I made a tool.']), DEFAULTS, () => {}, signal);
  assert.deepEqual([ok.text, ok.retried, ok.added], ['I made a tool.', true, false]);
  assert.match(calls[1]!, /added text that was not in the original/);
  const bad = await fix('i made a tool.', engine([padded, padded]), DEFAULTS, () => {}, signal);
  assert.equal(bad.added, true, 'twice: the panel is told, not the writer fooled');
  const clean1 = await fix('i made a tool.', engine(['I made a tool.']), DEFAULTS, () => {}, signal);
  assert.deepEqual([clean1.retried, clean1.added], [false, false]);
});

test('the red pen marks what was crossed out and what was written in, and counts a swap once', () => {
  // two corrections, each its own crossing-out: i -> I and make -> made
  const s = redPen('i make a tool', 'I made a tool');
  assert.deepEqual(s.map((x) => [x.mark, x.text]), [['del', 'i'], ['ins', 'I'], ['same', ' '], ['del', 'make'], ['ins', 'made'], ['same', ' a tool']]);
  assert.equal(corrections(s), 2);
  assert.equal(corrections(redPen('same text', 'same text')), 0);
});

test('the polish check finds the measured tells, where they are, and leaves the writer\'s rough text raw', () => {
  const rough = scan(ROUGH);
  assert.equal(rough.level, 'raw');
  assert.equal(rough.total, 0);
  const slop = scan(SLOP);
  const ids = slop.tells.map((t) => t.id).sort();
  for (const id of ['crucial', 'delve', 'leverage', 'important_to_note', 'rule_of_three']) assert.ok(ids.includes(id), id);
  assert.equal(slop.level, 'glossy');
  const delve = slop.tells.find((t) => t.id === 'delve')!;
  assert.equal(SLOP.slice(...delve.ranges[0]!), 'delve');
});

test('myths are reported as not tells, and never counted as polish', () => {
  const s = scan('Moreover, this works — mostly.');
  assert.equal(s.total, 0);
  assert.deepEqual(s.myths.map((m) => m.id).sort(), ['em_dash', 'moreover']);
  const strong = new Set(tells.strong.map((t) => t.id));
  for (const m of tells.myths) assert.ok(!strong.has(m.id), `${m.id} is both`);
});

test('added() names the tells a fix put in', () => {
  const before = scan('I use this tool for my project.');
  const after = scan('I leverage this tool for my project.');
  assert.deepEqual(added(before, after).map((t) => t.id), ['leverage']);
  assert.deepEqual(added(after, before), []);
});

test('level: one tell in a long text is a little shine, several is glossy', () => {
  assert.equal(level(0, 100), 'raw');
  assert.equal(level(1, 100), 'a-little');
  assert.equal(level(3, 100), 'polished');
  assert.equal(level(5, 40), 'glossy');
});

test('the tells come from the measured data: the ones people also use are not among them', () => {
  const strong = tells.strong.map((t) => t.id);
  for (const id of ['delve', 'leverage', 'rule_of_three']) assert.ok(strong.includes(id), id);
  for (const id of ['em_dash', 'moreover', 'uniform_sentences']) assert.ok(!strong.includes(id), id);
  for (const t of tells.strong) assert.ok(t.machine >= 2 * t.human && t.machine - t.human >= 8, t.id);
});

test('the prompt forbids introducing every measured tell and keeps one sentence for each in fix mode', () => {
  const p = systemPrompt('fix');
  for (const t of tells.strong) assert.ok(p.includes(t.label.replace(/[“”]/g, '"')), t.id);
  assert.match(p, /one output sentence for each input sentence/);
  assert.match(systemPrompt('clarity'), /split one sentence into two/);
});

test('nothing the user reads promises to get past AI detectors: that is not what this is', () => {
  const files = ['src/manifest.json', ...readdirSync('src/_locales').map((l) => `src/_locales/${l}/messages.json`), 'src/panel/panel.html', 'src/options/options.html'];
  if (existsSync('README.md')) files.push('README.md');
  for (const f of files) {
    const text = readFileSync(path.resolve(f), 'utf8');
    assert.doesNotMatch(text, /\b(detector|bypass|evade|undetectable|humani[sz]e)/i, f);
  }
});
