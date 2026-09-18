/**
 * One correction: ask the engine, clean what it says, and check that it did not write more than it was asked to.
 * When it did, it gets one stricter try; when it still does, the result is returned with `added` set, so the panel
 * can say so instead of quietly passing new sentences off as the writer's.
 */
import type { Engine } from '../engines/types';
import type { Settings } from '../settings';
import { systemPrompt, userPrompt, STRICTER } from './prompt';
import { clean, addedText } from './clean';

export interface Fixed { text: string; added: boolean; retried: boolean }

export async function fix(text: string, engine: Engine, s: Settings, onText: (soFar: string) => void, signal: AbortSignal): Promise<Fixed> {
  const ask = { system: systemPrompt(s.mode), user: userPrompt };
  const first = clean(await engine.correct(text, ask, s, onText, signal), text);
  if (!addedText(text, first)) return { text: first, added: false, retried: false };
  const strict = { system: `${ask.system}\n\n${STRICTER}`, user: userPrompt };
  const second = clean(await engine.correct(text, strict, s, onText, signal), text);
  return { text: second, added: addedText(text, second), retried: true };
}
