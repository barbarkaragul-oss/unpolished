import type { Settings } from '../settings';

export type EngineId = 'chrome-ai' | 'anthropic' | 'openai' | 'ollama' | 'none';
export type Availability = 'ready' | 'downloadable' | 'downloading' | 'unavailable' | 'needs-setup';
/** Where the text goes: shown on the panel, so the user always knows. */
export type Where = 'device' | 'cloud' | 'local-server' | 'none';

export interface Engine {
  id: EngineId;
  label: string;
  where: Where;
  availability(s: Settings): Promise<Availability>;
  /** Streams the corrected text through onText (the whole text so far each time) and resolves with the final answer. */
  correct(text: string, ask: Ask, s: Settings, onText: (soFar: string) => void, signal: AbortSignal): Promise<string>;
}

/** What the model is told: the system prompt, and how a piece of text is put to it. */
export interface Ask { system: string; user: (text: string) => string }

export class EngineError extends Error {
  constructor(message: string, readonly hint?: string) { super(message); }
}
