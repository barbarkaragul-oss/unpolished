/**
 * Settings. Saving asks Chrome only for what the chosen setup needs: the chosen provider's address, the Ollama
 * address, all sites for the stamp everywhere. Nothing is asked for up front.
 */
import { load, save, apiConfig, type Settings, type EngineChoice } from '../settings';
import { pick } from '../engines/pick';
import { listModels, endpoint } from '../engines/api';
import { PROVIDERS, providerById, type ProviderId } from '../engines/providers';
import { EngineError } from '../engines/types';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const CHOICES: { id: EngineChoice; t: string; d: string }[] = [
  { id: 'auto', t: 'Best available', d: 'Chrome\'s built-in model if this computer has it, then your API key, then Ollama.' },
  { id: 'chrome-ai', t: 'Chrome\'s built-in model', d: 'Runs on this computer; nothing is sent. Needs 22 GB free and a 4 GB GPU or 16 GB of RAM.' },
  { id: 'api', t: 'Your own API key', d: 'Claude, ChatGPT, Gemini, Mistral, Groq, DeepSeek, OpenRouter, Grok, Together, or any OpenAI-compatible address.' },
  { id: 'ollama', t: 'Ollama', d: 'A model on your own server.' },
  { id: 'none', t: 'Polish check only', d: 'No correcting; only shows what readers take as machine-written.' },
];
const STATUS: Record<string, string> = { ready: 'ready', downloadable: 'download once', downloading: 'downloading', unavailable: 'not here', 'needs-setup': 'set up below' };

let s: Settings;
const hasPermissions = (): boolean => typeof chrome !== 'undefined' && !!chrome.permissions;

/** Chrome asks the user for an address the first time the extension talks to it; asked inside the click that needs it. */
async function allow(origins: string[]): Promise<boolean> {
  if (!hasPermissions() || !origins.length) return true;
  if (await chrome.permissions.contains({ origins })) return true;
  return chrome.permissions.request({ origins });
}
const originOf = (url: string): string | null => { try { return `${new URL(url).origin}/*`; } catch { return null; } };

async function render(): Promise<void> {
  const p = await pick(s);
  $('choices').replaceChildren(...CHOICES.map((c) => {
    const avail = p.all.find((x) => x.engine.id === c.id)?.availability;
    const status = c.id === 'auto' ? (p.engine ? `uses ${p.engine.name(s).split(',')[0]}` : 'nothing ready yet') : c.id === 'none' ? '' : STATUS[avail ?? 'unavailable'];
    const label = document.createElement('label');
    label.className = 'choice';
    label.innerHTML = '<input type="radio" name="engine"><span class="t"></span><span class="s"></span><span class="d"></span>';
    (label.querySelector('.t') as HTMLElement).textContent = c.t;
    (label.querySelector('.d') as HTMLElement).textContent = c.d;
    const st = label.querySelector('.s') as HTMLElement;
    st.textContent = status ?? '';
    st.dataset.a = c.id === 'auto' ? (p.engine ? 'ready' : '') : avail ?? '';
    if (!status) st.style.visibility = 'hidden'; // keep its grid column, so the title does not wrap
    const input = label.querySelector('input') as HTMLInputElement;
    input.value = c.id;
    input.checked = s.engine === c.id;
    input.addEventListener('change', () => { s.engine = c.id; showBoxes(); });
    return label;
  }));
  showBoxes();
}

function showBoxes(): void {
  for (const b of document.querySelectorAll<HTMLElement>('.box[data-for]')) b.hidden = !(s.engine === b.dataset.for || (s.engine === 'auto' && b.dataset.for !== 'none'));
}

/** Fill the key, model and address fields from the chosen provider's own saved settings. */
function showProvider(): void {
  const pr = providerById(s.provider);
  const c = apiConfig(s);
  $<HTMLSelectElement>('provider').value = pr.id;
  $<HTMLInputElement>('apiKey').value = c.key;
  $<HTMLInputElement>('apiKey').placeholder = pr.keyOptional ? 'if the server wants one' : pr.id === 'anthropic' ? 'sk-ant-…' : 'your key';
  $<HTMLInputElement>('apiModel').value = c.model;
  $<HTMLInputElement>('baseUrl').value = c.baseUrl;
  $('base-row').hidden = pr.id !== 'custom';
  const at = $('keys-at');
  at.replaceChildren();
  if (pr.keysAt) { const a = document.createElement('a'); a.href = pr.keysAt; a.target = '_blank'; a.rel = 'noopener'; a.textContent = `Get a ${pr.name.replace(/ \(.*\)$/, '')} key`; at.append(a); }
  $('models').replaceChildren();
  $('models-status').textContent = '';
}

function setApi(field: 'key' | 'model' | 'baseUrl', value: string): void {
  s.apis = { ...s.apis, [s.provider]: { ...apiConfig(s), [field]: value } };
}

async function main(): Promise<void> {
  s = await load();
  const sel = $<HTMLSelectElement>('provider');
  sel.replaceChildren(...PROVIDERS.map((p) => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; return o; }));
  sel.addEventListener('change', () => { s.provider = sel.value as ProviderId; showProvider(); });
  $<HTMLInputElement>('apiKey').addEventListener('input', (e) => setApi('key', (e.target as HTMLInputElement).value));
  $<HTMLInputElement>('apiModel').addEventListener('input', (e) => setApi('model', (e.target as HTMLInputElement).value));
  $<HTMLInputElement>('baseUrl').addEventListener('input', (e) => setApi('baseUrl', (e.target as HTMLInputElement).value));
  for (const f of ['ollamaUrl', 'ollamaModel'] as const) { const i = $<HTMLInputElement>(f); i.value = s[f]; i.addEventListener('input', () => { s[f] = i.value; }); }
  const every = $<HTMLInputElement>('everywhere');
  every.checked = s.everywhere;
  every.addEventListener('change', () => { s.everywhere = every.checked; });
  showProvider();
  await render();

  $('load-models').addEventListener('click', async () => {
    const status = $('models-status');
    const o = originOf(endpoint(s).base);
    if (o && !(await allow([o]))) { status.textContent = 'Chrome did not grant access to that address.'; return; }
    status.textContent = 'Asking for the list…';
    try {
      const models = await listModels(s);
      $('models').replaceChildren(...models.map((m) => { const op = document.createElement('option'); op.value = m; return op; }));
      status.textContent = models.length ? `${models.length} models. Click the Model box to pick one, or type to filter.` : 'The provider listed no models.';
      if (!$<HTMLInputElement>('apiModel').value) $<HTMLInputElement>('apiModel').focus();
    } catch (e) {
      status.textContent = e instanceof EngineError ? `${e.message}${e.hint ? ` ${e.hint}` : ''}` : `Could not load the list: ${e instanceof Error ? e.message : String(e)}`;
    }
  });

  $('save').addEventListener('click', async () => {
    const status = $('status');
    status.textContent = '';
    const origins = [
      ...(s.engine === 'api' || s.engine === 'auto' ? [originOf(endpoint(s).base)] : []),
      ...(s.engine === 'ollama' || s.engine === 'auto' ? [originOf(s.ollamaUrl)] : []),
      ...(s.everywhere ? ['<all_urls>'] : []),
    ].filter((x): x is string => !!x && (x === '<all_urls>' || !x.startsWith('null')));
    if (!(await allow(origins))) {
      status.textContent = 'Chrome did not grant access, so that part will not work. Saved the rest.';
      if (s.everywhere) { s.everywhere = false; every.checked = false; }
    }
    await save(s);
    if (!status.textContent) status.textContent = 'Saved.';
    setTimeout(() => { status.textContent = ''; }, 2600);
    await render();
  });
}

void main();
