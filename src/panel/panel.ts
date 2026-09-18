/**
 * The panel. Two ways in: the side panel (the toolbar button), where you write or paste; and a page panel the content
 * script opens next to a text field, which is handed the text and hands the correction back ("Put it back").
 */
import { load, save, type Settings } from '../settings';
import { pick, type Pick } from '../engines/pick';
import { EngineError } from '../engines/types';
import { destination } from '../engines/api';
import { fix } from '../core/fix';
import { scan, added as addedTells, LEVEL_TEXT, type Scan, type Level } from '../core/scan';
import { redPen, corrections } from '../core/diff';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string | null)[]): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'text') el.textContent = v; else el.setAttribute(k, v); }
  for (const k of kids) if (k !== null) el.append(k);
  return el;
};

const nonce = new URLSearchParams(location.hash.slice(1)).get('inject');
const mode: 'inject' | 'standalone' = nonce ? 'inject' : 'standalone';
document.body.dataset.mode = mode;

let settings: Settings;
let chosen: Pick;
let original = '';
let fixed = '';
let controller: AbortController | undefined;

const toParent = (msg: Record<string, unknown>): void => { if (nonce) parent.postMessage({ ...msg, nonce }, '*'); };

// ---- engine chip and privacy line: the user always sees where the text goes
function describe(): void {
  const chip = $('engine'), name = $('engine-name'), privacy = $('privacy');
  const e = chosen.engine;
  const lock = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  chip.dataset.where = e && chosen.availability !== 'unavailable' ? e.where : 'none';
  if (e && chosen.availability === 'ready') {
    name.textContent = e.name(settings);
    const to = destination(settings);
    const keyed = settings.provider === 'custom' ? '' : ', with your key';
    privacy.innerHTML = lock + (e.where === 'device' ? 'Nothing leaves this computer.' : e.where === 'cloud' ? `Sent only to ${to}${keyed}. No server of ours.` : 'Sent only to your own Ollama server.');
  } else if (e && (chosen.availability === 'downloadable' || chosen.availability === 'downloading')) {
    name.textContent = chosen.availability === 'downloading' ? 'Chrome is downloading its model…' : 'Chrome has a model for this; the first fix downloads it once';
    privacy.innerHTML = lock + 'Nothing leaves this computer.';
  } else {
    name.textContent = 'Polish check only: no model set up yet';
    const set = h('button', { text: 'Set one up' });
    set.addEventListener('click', openSettings);
    chip.append(' · ', set);
    privacy.innerHTML = lock + 'Nothing leaves this computer.';
  }
}

function openSettings(): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) void chrome.runtime.openOptionsPage();
  else window.open('options.html', '_blank');
}

// ---- views
function showTab(tab: string): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('.tabs [role="tab"]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const v of document.querySelectorAll<HTMLElement>('[data-view]')) v.hidden = v.dataset.view !== tab;
}

function withMarks(text: string, s: Scan): DocumentFragment {
  const f = document.createDocumentFragment();
  const ranges = s.tells.flatMap((t) => t.ranges).sort((a, b) => a[0] - b[0]);
  let at = 0;
  for (const [a, b] of ranges) {
    if (a < at) continue;
    f.append(text.slice(at, a), h('mark', { text: text.slice(a, b) }));
    at = b;
  }
  f.append(text.slice(at));
  return f;
}

const POSITION: Record<Level, number> = { raw: 6, 'a-little': 36, polished: 66, glossy: 94 };

/** The catalogue's labels are precise; on the panel a reader needs the plain name. */
const PLAIN: Record<string, string> = {
  delve: 'delve', crucial: 'crucial', leverage: 'leverage (as a verb)', important_to_note: 'it is important to note',
  rule_of_three: 'a list of three', em_dash: 'a dash', moreover: 'moreover', tapestry: 'tapestry', showcase: 'showcase',
  underscore: 'underscores', in_todays: 'in today’s…', not_x_its_y: 'it’s not X, it’s Y', dive_into: 'dive into / let’s explore',
  bulleted_bold: 'bold bullet points', title_case_headings: 'Title Case headings',
};
const plain = (id: string, label: string): string => PLAIN[id] ?? label.replace(/[“”]/g, '');

function renderPolish(before: Scan, after: Scan | undefined, text: string): void {
  const v = $('view-polish');
  const now = after ?? before;
  const t = LEVEL_TEXT[now.level];
  const added = after ? addedTells(before, after) : [];
  $('polish-dot').dataset.level = now.level;

  const ruler = h('div', { class: 'ruler', 'aria-hidden': 'true' }, h('div', { class: 'track' }));
  for (const [lvl, x] of Object.entries(POSITION) as [Level, number][]) ruler.append(h('span', { class: 'tick', style: `left:${x}%`, text: LEVEL_TEXT[lvl].name }));
  const same = !after || before.level === now.level;
  if (!same) ruler.append(h('span', { class: 'pin before', style: `left:${POSITION[before.level]}%`, text: 'yours' }, h('i')));
  ruler.append(h('span', { class: 'pin after', style: `left:${POSITION[now.level]}%`, text: !after ? 'yours' : same ? 'yours & fixed' : 'fixed' }, h('i')));

  const list = h('div', { class: 'list' });
  for (const f of now.tells) {
    const isAdded = added.some((a) => a.id === f.id);
    list.append(h('div', { class: `item${isAdded ? ' added' : ''}` },
      h('span', { class: 'n', text: `×${f.count}` }),
      h('span', { class: 'name' }, h('mark', { text: plain(f.id, f.label) })),
      h('span', { class: 'why', text: `${isAdded ? 'The fix added this. ' : ''}In ${f.machine}% of ${f.machineArm}'s texts; ${f.human}% of people's.` })));
  }
  // what the fix took out, which is worth saying: it is the opposite of what a polishing tool does
  const removed = after ? before.tells.filter((b) => (after.tells.find((a) => a.id === b.id)?.count ?? 0) < b.count) : [];
  for (const r of removed) {
    list.append(h('div', { class: 'item removed' },
      h('span', { class: 'n', text: '−' }),
      h('span', { class: 'name', text: plain(r.id, r.label) }),
      h('span', { class: 'why', text: 'Was in your text; the fix took it out.' })));
  }
  const myths = h('div', { class: 'list' });
  for (const m of now.myths) {
    myths.append(h('div', { class: 'item myth' },
      h('span', { class: 'n', text: '✓' }),
      h('span', { class: 'name', text: `${plain(m.id, m.label)} ×${m.count}` }),
      h('span', { class: 'why', text: `Not a tell: ${m.note}.` })));
  }

  v.replaceChildren(...([
    h('div', { class: 'verdict' }, h('span', { class: 'level', 'data-level': now.level, text: t.name }), h('p', { text: t.line })),
    ruler,
    now.tells.length ? h('div', { class: 'page notebook marked' }, withMarks(text, now)) : null,
    now.tells.length || removed.length ? h('p', { class: 'section-title', text: 'What readers notice' }) : null,
    now.tells.length || removed.length ? list : null,
    now.myths.length ? h('p', { class: 'section-title', text: 'Relax, these are not tells' }) : null,
    now.myths.length ? myths : null,
    h('p', { class: 'fine', text: 'Measured on the same documents written by people and by six models; a habit, not a proof. Full table: is-it-really-an-ai-tell.' }),
  ] as (HTMLElement | null)[]).filter((x): x is HTMLElement => x !== null));
  if (added.length) warn(`<b>The fix added polish:</b> ${added.map((a) => plain(a.id, a.label)).join(', ')}. You may want to keep your own wording there.`);
}

function renderClean(text: string, streaming: boolean): void {
  const v = $('view-clean');
  v.textContent = text;
  v.classList.toggle('streaming', streaming);
}

function renderPen(): void {
  const v = $('view-pen');
  const segs = redPen(original, fixed);
  v.replaceChildren(...segs.map((s) => (s.mark === 'same' ? document.createTextNode(s.text) : h(s.mark, { text: s.text }))));
  const n = corrections(segs);
  $('pen-count').textContent = n ? String(n) : '';
}

function warn(html: string): void {
  const w = $('warning');
  w.innerHTML = html;
  w.hidden = false;
}

function busy(on: boolean, text = 'Reading it with a red pen…'): void {
  $('working').hidden = !on;
  $('working-text').textContent = text;
  const fixBtn = $<HTMLButtonElement>('fix');
  fixBtn.disabled = on;
}

// ---- the run
async function run(): Promise<void> {
  if (!original.trim()) return;
  const before = scan(original);
  $('warning').hidden = true;
  $('result').hidden = false;
  $('foot').hidden = true;
  $('pen-count').textContent = '';

  const e = chosen.engine;
  if (!e || chosen.availability === 'unavailable' || chosen.availability === 'needs-setup') {
    // no model: the polish check still runs on the writer's text
    fixed = original;
    renderClean(original, false);
    renderPolish(before, undefined, original);
    showTab('polish');
    warn(`<b>No model to correct with yet.</b> The polish check above works without one. Set up Chrome's built-in model, your own key, or Ollama in Settings.`);
    $('foot').hidden = false;
    return;
  }

  // Chrome downloads its model only inside a click; the page panel was opened by a message, so ask for one
  if (chosen.availability !== 'ready' && !navigator.userActivation?.isActive) {
    renderPolish(before, undefined, original);
    showTab('polish');
    const w = $('warning');
    w.innerHTML = '<b>One step first.</b> Chrome has a built-in model that corrects on this computer. It downloads once (a few GB; Chrome shows the progress).';
    const go = h('button', { class: 'stamp', text: 'Download and fix' });
    go.addEventListener('click', () => { void run(); });
    w.append(h('br'), go);
    w.hidden = false;
    return;
  }

  showTab('clean');
  renderClean('', true);
  busy(true, chosen.availability === 'ready' ? 'Reading it with a red pen…' : 'Chrome is getting its model ready (once)…');
  controller = new AbortController();
  try {
    const r = await fix(original, e, settings, (soFar) => renderClean(soFar, true), controller.signal);
    fixed = r.text;
    renderClean(fixed, false);
    renderPen();
    const after = scan(fixed);
    renderPolish(before, after, fixed);
    if (r.added) warn(`<b>It tried to add sentences</b> you did not write, twice. Check the Red pen tab before you use this.`);
    else if (fixed.trim() === original.trim()) warn(`<b>Nothing to fix.</b> Your English was fine as it was.`);
    $('foot').hidden = false;
    if (chosen.availability !== 'ready') { chosen = await pick(settings); describe(); }
  } catch (err) {
    renderClean(original, false);
    if (controller.signal.aborted) { warn('<b>Stopped.</b>'); }
    else {
      const msg = err instanceof EngineError ? `${err.message}${err.hint ? ` ${err.hint}` : ''}` : err instanceof Error ? err.message : String(err);
      warn(`<b>Could not correct it:</b> ${msg.replace(/</g, '&lt;')}`);
      renderPolish(before, undefined, original);
    }
  } finally {
    busy(false);
    controller = undefined;
  }
}

// ---- wiring
async function main(): Promise<void> {
  settings = await load();
  for (const b of document.querySelectorAll<HTMLButtonElement>('.seg [role="radio"]')) {
    b.setAttribute('aria-checked', String(b.dataset.mode === settings.mode));
    b.addEventListener('click', async () => {
      settings.mode = b.dataset.mode === 'clarity' ? 'clarity' : 'fix';
      for (const x of document.querySelectorAll('.seg [role="radio"]')) x.setAttribute('aria-checked', String(x === b));
      await save(settings);
    });
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('.tabs [role="tab"]')) b.addEventListener('click', () => showTab(b.dataset.tab!));
  $('settings').addEventListener('click', openSettings);
  $('stop').addEventListener('click', () => controller?.abort());
  $('copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(fixed);
    const b = $('copy'); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1400);
  });
  $('again').addEventListener('click', () => { $('result').hidden = true; $('foot').hidden = true; $<HTMLTextAreaElement>('input').focus(); });
  $('fix').addEventListener('click', () => { original = $<HTMLTextAreaElement>('input').value; void run(); });
  $<HTMLTextAreaElement>('input').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); $('fix').click(); } });
  $('replace').addEventListener('click', () => toParent({ type: 'unpolished:replace', text: fixed }));
  $('close').addEventListener('click', () => toParent({ type: 'unpolished:close' }));
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && mode === 'inject') toParent({ type: 'unpolished:close' }); });

  chosen = await pick(settings);
  describe();

  if (mode === 'inject') {
    window.addEventListener('message', (ev) => {
      const d = ev.data as { type?: string; nonce?: string; text?: string; canReplace?: boolean };
      if (ev.source !== parent || d?.nonce !== nonce || d.type !== 'unpolished:text' || typeof d.text !== 'string') return;
      original = d.text;
      // selected text on a page, not in a field: nothing to put it back into, so Copy is the way out
      $('replace').hidden = d.canReplace === false;
      $('yours').hidden = false;
      $('yours-text').textContent = original;
      $('yours-count').textContent = `· ${original.trim().split(/\s+/).length} words`;
      void run();
    });
    toParent({ type: 'unpolished:ready' });
  } else {
    $<HTMLTextAreaElement>('input').focus();
  }
}

void main();
