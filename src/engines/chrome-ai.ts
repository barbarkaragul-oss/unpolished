/**
 * Chrome's built-in model (Gemini Nano) through the Prompt API, available to extensions from Chrome 138. It runs on
 * the user's computer: nothing is sent anywhere. It needs a desktop with 22 GB free and a 4 GB GPU or 16 GB of RAM,
 * and the first use downloads the model, which Chrome only starts after a click.
 */
import type { Ask, Availability, Engine } from './types';
import { EngineError } from './types';

interface LanguageModelSession {
  promptStreaming(input: string, opts?: { signal?: AbortSignal }): ReadableStream<string> & AsyncIterable<string>;
  prompt(input: string, opts?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
  contextWindow?: number;
  inputQuota?: number;
}
interface LanguageModelStatic {
  availability(opts?: unknown): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>;
  create(opts: unknown): Promise<LanguageModelSession>;
}
const api = (): LanguageModelStatic | undefined => (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel;

const OPTIONS = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

/** Paragraphs, joined back with the separators they had, so a long text fits the model's window a piece at a time. */
function pieces(text: string): { body: string; sep: string }[] {
  const out: { body: string; sep: string }[] = [];
  const re = /\n\s*\n/g;
  let last = 0;
  for (const m of text.matchAll(re)) { out.push({ body: text.slice(last, m.index), sep: m[0] }); last = m.index + m[0].length; }
  out.push({ body: text.slice(last), sep: '' });
  return out;
}

export const chromeAi: Engine = {
  id: 'chrome-ai',
  name: () => 'Chrome, on this computer',
  where: 'device',
  async availability(): Promise<Availability> {
    const lm = api();
    if (!lm) return 'unavailable';
    try {
      const a = await lm.availability(OPTIONS);
      return a === 'available' ? 'ready' : a;
    } catch { return 'unavailable'; }
  },
  async correct(text: string, ask: Ask, _s, onText, signal): Promise<string> {
    const lm = api();
    if (!lm) throw new EngineError('Chrome\'s built-in model is not available in this browser.');
    // create() starts the model download when it is not there yet; it must run inside the click that asked for it
    const session = await lm.create({ ...OPTIONS, initialPrompts: [{ role: 'system', content: ask.system }], temperature: 0.2, topK: 3, signal });
    try {
      let done = '';
      for (const p of pieces(text)) {
        if (!p.body.trim()) { done += p.body + p.sep; onText(done); continue; }
        let piece = '';
        const stream = session.promptStreaming(ask.user(p.body), { signal });
        for await (const chunk of stream) {
          // older Chrome streams the whole answer so far, newer streams the new part only
          piece = chunk.startsWith(piece) ? chunk : piece + chunk;
          onText(done + piece);
        }
        done += piece.trim() + p.sep;
      }
      return done;
    } finally { session.destroy(); }
  },
};
