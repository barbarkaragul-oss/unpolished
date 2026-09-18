/**
 * Which engine corrects the text: the one the user chose, or, on auto, the first that is ready. Chrome's own model
 * comes first because nothing leaves the computer; with none ready the panel still runs the polish check.
 */
import type { Settings } from '../settings';
import type { Availability, Engine, EngineId } from './types';
import { chromeAi } from './chrome-ai';
import { api } from './api';
import { ollama } from './ollama';

export const ENGINES: Engine[] = [chromeAi, api, ollama];
export const engineById = (id: EngineId): Engine | undefined => ENGINES.find((e) => e.id === id);

export interface Pick { engine: Engine | undefined; availability: Availability; all: { engine: Engine; availability: Availability }[] }

export async function pick(s: Settings): Promise<Pick> {
  const all = await Promise.all(ENGINES.map(async (engine) => ({ engine, availability: await engine.availability(s) })));
  if (s.engine === 'none') return { engine: undefined, availability: 'unavailable', all };
  if (s.engine !== 'auto') {
    const chosen = all.find((x) => x.engine.id === s.engine);
    return { engine: chosen?.engine, availability: chosen?.availability ?? 'unavailable', all };
  }
  const ready = all.find((x) => x.availability === 'ready');
  if (ready) return { engine: ready.engine, availability: 'ready', all };
  // Chrome's model is there but not downloaded yet: offer it, the click that follows starts the download
  const chrome = all.find((x) => x.engine.id === 'chrome-ai' && (x.availability === 'downloadable' || x.availability === 'downloading'));
  if (chrome) return { engine: chrome.engine, availability: chrome.availability, all };
  return { engine: undefined, availability: 'unavailable', all };
}
