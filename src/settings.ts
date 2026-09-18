/**
 * Settings live in chrome.storage.local, on this computer only, never in sync storage: an API key must not travel
 * to the user's other machines. Outside the extension (the dev playground) they fall back to localStorage.
 */
import type { Mode } from './core/prompt';
import type { ProviderId } from './engines/providers';

export type EngineChoice = 'auto' | 'chrome-ai' | 'api' | 'ollama' | 'none';

/** One provider's key, model and, for "Other", address. Kept per provider, so switching does not lose a key. */
export interface ApiConfig { key: string; model: string; baseUrl: string }

export interface Settings {
  engine: EngineChoice;
  mode: Mode;
  /** which API "your own key" means */
  provider: ProviderId;
  apis: Partial<Record<ProviderId, ApiConfig>>;
  ollamaUrl: string;
  ollamaModel: string;
  /** show the stamp in every text field on every site; needs the all-sites permission, asked for when turned on */
  everywhere: boolean;
}

export const DEFAULTS: Settings = {
  engine: 'auto',
  mode: 'fix',
  provider: 'anthropic',
  apis: {},
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3:latest',
  everywhere: false,
};

export const apiConfig = (s: Settings, id: ProviderId = s.provider): ApiConfig => ({ key: '', model: '', baseUrl: '', ...s.apis[id] });

/** 0.1.0 kept one Anthropic and one OpenAI key in flat fields; carry them over. */
function upgrade(raw: Record<string, unknown>): Partial<Settings> {
  const s = { ...raw } as Partial<Settings> & Record<string, unknown>;
  const apis: Partial<Record<ProviderId, ApiConfig>> = { ...(s.apis ?? {}) };
  if (typeof raw.anthropicKey === 'string' && raw.anthropicKey && !apis.anthropic) apis.anthropic = { key: raw.anthropicKey, model: String(raw.anthropicModel ?? ''), baseUrl: '' };
  if (typeof raw.openaiKey === 'string' && raw.openaiKey && !apis.openai) apis.openai = { key: raw.openaiKey, model: String(raw.openaiModel ?? ''), baseUrl: '' };
  if (raw.engine === 'anthropic' || raw.engine === 'openai') { s.provider = raw.engine; s.engine = 'api'; }
  for (const k of ['anthropicKey', 'anthropicModel', 'openaiKey', 'openaiModel']) delete s[k];
  s.apis = apis;
  return s;
}

const hasChrome = (): boolean => typeof chrome !== 'undefined' && !!chrome.storage?.local;

export async function load(): Promise<Settings> {
  let raw: Record<string, unknown> = {};
  if (hasChrome()) raw = ((await chrome.storage.local.get('settings')).settings as Record<string, unknown> | undefined) ?? {};
  else { try { raw = JSON.parse(localStorage.getItem('unpolished.settings') ?? '{}') as Record<string, unknown>; } catch { /* private window */ } }
  return { ...DEFAULTS, ...upgrade(raw) };
}

export async function save(s: Settings): Promise<void> {
  if (hasChrome()) { await chrome.storage.local.set({ settings: s }); return; }
  try { localStorage.setItem('unpolished.settings', JSON.stringify(s)); } catch { /* private window: settings last this session */ }
}
