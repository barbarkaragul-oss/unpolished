/**
 * Settings live in chrome.storage.local, on this computer only, never in sync storage: an API key must not travel
 * to the user's other machines. Outside the extension (the dev playground) they fall back to localStorage.
 */
import type { Mode } from './core/prompt';

export type EngineChoice = 'auto' | 'chrome-ai' | 'anthropic' | 'openai' | 'ollama' | 'none';

export interface Settings {
  engine: EngineChoice;
  mode: Mode;
  anthropicKey: string;
  anthropicModel: string;
  openaiKey: string;
  openaiModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  /** show the button in every text field on every site; needs the all-sites permission, asked for when turned on */
  everywhere: boolean;
}

export const DEFAULTS: Settings = {
  engine: 'auto',
  mode: 'fix',
  anthropicKey: '',
  anthropicModel: 'claude-haiku-4-5',
  openaiKey: '',
  openaiModel: '',
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3:latest',
  everywhere: false,
};

const hasChrome = (): boolean => typeof chrome !== 'undefined' && !!chrome.storage?.local;

export async function load(): Promise<Settings> {
  if (hasChrome()) return { ...DEFAULTS, ...((await chrome.storage.local.get('settings')).settings as Partial<Settings> | undefined) };
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem('unpolished.settings') ?? '{}') as Partial<Settings>) }; } catch { return { ...DEFAULTS }; }
}

export async function save(s: Settings): Promise<void> {
  if (hasChrome()) { await chrome.storage.local.set({ settings: s }); return; }
  try { localStorage.setItem('unpolished.settings', JSON.stringify(s)); } catch { /* private window: settings last this session */ }
}
