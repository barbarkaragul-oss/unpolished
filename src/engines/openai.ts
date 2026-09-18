/** The user's own OpenAI key, straight to api.openai.com. The model name is the user's to give. */
import type { Ask, Availability, Engine } from './types';
import { EngineError } from './types';
import type { Settings } from '../settings';

export const openai: Engine = {
  id: 'openai',
  label: 'OpenAI, with your key',
  where: 'cloud',
  async availability(s: Settings): Promise<Availability> {
    return s.openaiKey.trim() && s.openaiModel.trim() ? 'ready' : 'needs-setup';
  },
  async correct(text: string, ask: Ask, s: Settings, onText, signal): Promise<string> {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${s.openaiKey.trim()}` },
      body: JSON.stringify({ model: s.openaiModel.trim(), messages: [{ role: 'system', content: ask.system }, { role: 'user', content: ask.user(text) }] }),
    });
    if (r.status === 401) throw new EngineError('OpenAI did not accept the API key.', 'Check the key in Settings.');
    if (!r.ok) throw new EngineError(`OpenAI answered ${r.status}.`, (await r.text()).slice(0, 200));
    const out = ((await r.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? '';
    onText(out);
    return out;
  },
};
