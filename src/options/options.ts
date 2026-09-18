/**
 * Settings. Saving asks Chrome only for what the chosen setup needs: the Anthropic or OpenAI address when a key is
 * set, the Ollama address, all sites for the stamp everywhere. Nothing is asked for up front.
 */
import { load, save, type Settings, type EngineChoice } from '../settings';
import { pick } from '../engines/pick';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const CHOICES: { id: EngineChoice; t: string; d: string }[] = [
  { id: 'auto', t: 'Best available', d: 'Chrome\'s built-in model if this computer has it, then your key, then Ollama.' },
  { id: 'chrome-ai', t: 'Chrome\'s built-in model', d: 'Runs on this computer; nothing is sent. Needs 22 GB free and a 4 GB GPU or 16 GB of RAM.' },
  { id: 'anthropic', t: 'Claude, with your key', d: 'Best quality. Straight to Anthropic, billed to your key.' },
  { id: 'openai', t: 'OpenAI, with your key', d: 'Straight to OpenAI, billed to your key.' },
  { id: 'ollama', t: 'Ollama', d: 'A model on your own server.' },
  { id: 'none', t: 'Polish check only', d: 'No correcting; only shows what readers take as machine-written.' },
];
const STATUS: Record<string, string> = { ready: 'ready', downloadable: 'download once', downloading: 'downloading', unavailable: 'not here', 'needs-setup': 'set up below' };
const FIELDS = ['anthropicKey', 'anthropicModel', 'openaiKey', 'openaiModel', 'ollamaUrl', 'ollamaModel'] as const;

let s: Settings;

async function render(): Promise<void> {
  const p = await pick(s);
  const box = $('choices');
  box.replaceChildren(...CHOICES.map((c) => {
    const a = c.id === 'auto' ? (p.engine ? `uses ${p.engine.label.split(',')[0]}` : 'nothing ready yet') : c.id === 'none' ? '' : STATUS[p.all.find((x) => x.engine.id === c.id)?.availability ?? 'unavailable'];
    const label = document.createElement('label');
    label.className = 'choice';
    label.innerHTML = `<input type="radio" name="engine" value="${c.id}"><span class="t"></span><span class="s"></span><span class="d"></span>`;
    (label.querySelector('.t') as HTMLElement).textContent = c.t;
    (label.querySelector('.d') as HTMLElement).textContent = c.d;
    const st = label.querySelector('.s') as HTMLElement;
    st.textContent = a ?? '';
    st.dataset.a = c.id === 'auto' ? (p.engine ? 'ready' : '') : p.all.find((x) => x.engine.id === c.id)?.availability ?? '';
    if (!a) st.remove();
    const input = label.querySelector('input') as HTMLInputElement;
    input.checked = s.engine === c.id;
    input.addEventListener('change', () => { s.engine = c.id; showBoxes(); });
    return label;
  }));
  showBoxes();
}

function showBoxes(): void {
  for (const b of document.querySelectorAll<HTMLElement>('.box[data-for]')) b.hidden = !(s.engine === b.dataset.for || (s.engine === 'auto' && b.dataset.for !== 'openai'));
}

function originsNeeded(next: Settings): string[] {
  const o: string[] = [];
  if (next.anthropicKey.trim()) o.push('https://api.anthropic.com/*');
  if (next.openaiKey.trim()) o.push('https://api.openai.com/*');
  if (next.ollamaUrl.trim()) { try { o.push(`${new URL(next.ollamaUrl).origin}/*`); } catch { /* not a URL: saved, not granted */ } }
  if (next.everywhere) o.push('<all_urls>');
  return o;
}

async function main(): Promise<void> {
  s = await load();
  for (const f of FIELDS) { const i = $<HTMLInputElement>(f); i.value = s[f]; i.addEventListener('input', () => { s[f] = i.value; }); }
  const every = $<HTMLInputElement>('everywhere');
  every.checked = s.everywhere;
  every.addEventListener('change', () => { s.everywhere = every.checked; });
  await render();

  $('save').addEventListener('click', async () => {
    const status = $('status');
    const origins = originsNeeded(s);
    // asked inside the click, as Chrome requires; only for what this setup uses
    if (typeof chrome !== 'undefined' && chrome.permissions && origins.length) {
      const ok = await chrome.permissions.request({ origins });
      if (!ok) { status.textContent = 'Chrome did not grant access, so that part will not work. Saved the rest.'; if (s.everywhere) { s.everywhere = false; every.checked = false; } }
    }
    await save(s);
    if (!status.textContent) status.textContent = 'Saved.';
    setTimeout(() => { status.textContent = ''; }, 2600);
    await render();
  });
}

void main();
