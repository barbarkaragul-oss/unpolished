/**
 * The user's own API key, for whichever provider they chose. The request goes from the extension straight to the
 * provider; there is no server of ours in between. Claude through the Anthropic SDK (dangerouslyAllowBrowser is the
 * SDK's switch for exactly this: the key is the user's, in chrome.storage.local, not one shipped in a web page);
 * everything else through the OpenAI chat completions protocol, streamed.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Ask, Availability, Engine } from './types';
import { EngineError } from './types';
import { apiConfig, type Settings } from '../settings';
import { providerById, type Provider } from './providers';
import { sseLines, deltaText } from './sse';

export function endpoint(s: Settings): { p: Provider; key: string; model: string; base: string } {
  const p = providerById(s.provider);
  const c = apiConfig(s);
  return { p, key: c.key.trim(), model: c.model.trim(), base: (c.baseUrl.trim() || p.baseUrl).replace(/\/+$/, '') };
}

function explain(status: number, body: string, p: Provider): EngineError {
  if (status === 401 || status === 403) return new EngineError(`${p.name} did not accept the API key.`, 'Check the key in Settings.');
  if (status === 404) return new EngineError(`${p.name} does not know that model.`, 'Pick one from the list in Settings.');
  if (status === 429) return new EngineError(`${p.name} is rate limiting this key, or it has no credit left.`, 'Wait a minute, or check your account.');
  return new EngineError(`${p.name} answered ${status}.`, body.slice(0, 200));
}

async function viaAnthropic(text: string, ask: Ask, key: string, model: string, onText: (s: string) => void, signal: AbortSignal): Promise<string> {
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
  try {
    const stream = client.messages.stream({
      model,
      // a correction is about as long as the text; this leaves room without letting it run on
      max_tokens: Math.min(16000, Math.ceil(text.length / 2) + 1024),
      system: ask.system,
      messages: [{ role: 'user', content: ask.user(text) }],
    }, { signal });
    let soFar = '';
    stream.on('text', (delta) => { soFar += delta; onText(soFar); });
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') throw new EngineError('The model declined to correct this text.');
    return final.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new EngineError('Anthropic did not accept the API key.', 'Check the key in Settings.');
    if (e instanceof Anthropic.NotFoundError) throw new EngineError('Anthropic does not know that model.', 'Pick one from the list in Settings.');
    if (e instanceof Anthropic.RateLimitError) throw new EngineError('Anthropic is rate limiting this key.', 'Wait a minute and try again.');
    if (e instanceof Anthropic.APIConnectionError) throw new EngineError('Could not reach api.anthropic.com.', 'Check your connection.');
    throw e;
  }
}

async function viaOpenAiCompatible(text: string, ask: Ask, e: ReturnType<typeof endpoint>, onText: (s: string) => void, signal: AbortSignal): Promise<string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (e.key) headers.authorization = `Bearer ${e.key}`;
  // OpenRouter shows these on the user's own activity page, so they can tell where a request came from
  if (e.p.id === 'openrouter') { headers['x-title'] = 'Unpolished'; headers['http-referer'] = 'https://barbaros.dev/unpolished'; }
  let r: Response;
  try {
    r = await fetch(`${e.base}/chat/completions`, {
      method: 'POST', signal, headers,
      body: JSON.stringify({ model: e.model, stream: true, temperature: 0.2, messages: [{ role: 'system', content: ask.system }, { role: 'user', content: ask.user(text) }] }),
    });
  } catch (err) { if (signal.aborted) throw err; throw new EngineError(`Could not reach ${e.p.name} at ${e.base}.`, 'Check the address and your connection.'); }
  if (!r.ok || !r.body) throw explain(r.status, await r.text(), e.p);
  let soFar = '';
  const feed = sseLines((j) => {
    const err = (j as { error?: { message?: string } }).error;
    if (err) throw new EngineError(`${e.p.name}: ${err.message ?? 'error'}`);
    const d = deltaText(j);
    if (d) { soFar += d; onText(soFar); }
  });
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    feed(value);
  }
  feed('\n');
  return soFar;
}

/** Where the text goes, as the user should read it: the provider, or for Other the server's own address. */
export function destination(s: Settings): string {
  const e = endpoint(s);
  if (e.p.id === 'custom') { try { return new URL(e.base).host; } catch { return 'your server'; } }
  return e.p.name.replace(/ \(.*\)$/, '');
}

export const api: Engine = {
  id: 'api',
  where: 'cloud',
  name: (s) => (s.provider === 'custom' ? `${destination(s)}, OpenAI-compatible` : `${destination(s)}, with your key`),
  async availability(s: Settings): Promise<Availability> {
    const e = endpoint(s);
    if (!e.base || !e.model) return 'needs-setup';
    return e.key || e.p.keyOptional ? 'ready' : 'needs-setup';
  },
  async correct(text: string, ask: Ask, s: Settings, onText, signal): Promise<string> {
    const e = endpoint(s);
    return e.p.kind === 'anthropic' ? viaAnthropic(text, ask, e.key, e.model, onText, signal) : viaOpenAiCompatible(text, ask, e, onText, signal);
  },
};

/** Words in a model id that mean it cannot chat: embeddings, speech, images, moderation. */
const NOT_CHAT = /embed|whisper|tts|speech|transcri|dall-e|image|moderation|rerank|audio|realtime/i;

/** The provider's own list of models, for the picker; a failure says why, in words the options page shows. */
export async function listModels(s: Settings): Promise<string[]> {
  const e = endpoint(s);
  if (!e.base) throw new EngineError('Give the address first.');
  if (e.p.kind === 'anthropic') {
    if (!e.key) throw new EngineError('Enter the key first.');
    const client = new Anthropic({ apiKey: e.key, dangerouslyAllowBrowser: true, maxRetries: 1 });
    const out: string[] = [];
    try { for await (const m of client.models.list({ limit: 100 })) out.push(m.id); } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new EngineError('Anthropic did not accept the API key.');
      throw err;
    }
    return out;
  }
  const r = await fetch(`${e.base}/models`, { headers: e.key ? { authorization: `Bearer ${e.key}` } : {} });
  if (!r.ok) throw explain(r.status, await r.text(), e.p);
  const data = ((await r.json()) as { data?: { id: string }[] }).data ?? [];
  return data.map((m) => m.id.replace(/^models\//, '')).filter((id) => !NOT_CHAT.test(id)).sort();
}
