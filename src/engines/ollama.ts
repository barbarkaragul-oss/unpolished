/** A model on the user's own Ollama server. Streams newline-delimited JSON. */
import type { Ask, Availability, Engine } from './types';
import { EngineError } from './types';
import type { Settings } from '../settings';

const base = (s: Settings): string => s.ollamaUrl.trim().replace(/\/+$/, '');

export const ollama: Engine = {
  id: 'ollama',
  label: 'Ollama, on your server',
  where: 'local-server',
  async availability(s: Settings): Promise<Availability> {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1500);
      const r = await fetch(`${base(s)}/api/tags`, { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) return 'unavailable';
      const models = ((await r.json()) as { models?: { name: string }[] }).models ?? [];
      return models.some((m) => m.name === s.ollamaModel || m.name === `${s.ollamaModel}:latest`) ? 'ready' : 'needs-setup';
    } catch { return 'unavailable'; }
  },
  async correct(text: string, ask: Ask, s: Settings, onText, signal): Promise<string> {
    let r: Response;
    try {
      r = await fetch(`${base(s)}/api/generate`, {
        method: 'POST', signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: s.ollamaModel, system: ask.system, prompt: ask.user(text), stream: true, options: { temperature: 0.2 } }),
      });
    } catch (e) { if (signal.aborted) throw e; throw new EngineError(`Could not reach Ollama at ${base(s)}.`, 'Is it running?'); }
    if (!r.ok || !r.body) throw new EngineError(`Ollama answered ${r.status}.`, (await r.text()).slice(0, 200));
    const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '', soFar = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        const j = JSON.parse(line) as { response?: string; error?: string };
        if (j.error) throw new EngineError(`Ollama: ${j.error}`);
        if (j.response) { soFar += j.response; onText(soFar); }
      }
    }
    return soFar;
  },
};
