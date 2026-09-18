import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sseLines, deltaText } from '../src/engines/sse';
import { api, endpoint, listModels } from '../src/engines/api';
import { PROVIDERS, providerById } from '../src/engines/providers';
import { DEFAULTS, apiConfig, type Settings } from '../src/settings';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const settings = (over: Partial<Settings>): Settings => ({ ...DEFAULTS, ...over });

test('the stream parser reads data lines whole, however the chunks split them', () => {
  const got: string[] = [];
  const feed = sseLines((j) => got.push(deltaText(j)));
  feed('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\nda');
  feed('ta: {"choices":[{"delta":{"content":"lo"}}]}\r\n');
  feed(': keep-alive\n\ndata: [DONE]\n');
  assert.deepEqual(got, ['Hel', 'lo']);
});

test('every provider but Other has an address, and the ids are unique', () => {
  assert.equal(new Set(PROVIDERS.map((p) => p.id)).size, PROVIDERS.length);
  for (const p of PROVIDERS) if (p.id !== 'custom') assert.match(p.baseUrl, /^https:\/\//, p.id);
  assert.equal(providerById('custom').keyOptional, true);
});

test('a provider is ready once it has a key and a model; Other needs an address, not a key', async () => {
  assert.equal(await api.availability(settings({ provider: 'gemini' })), 'needs-setup');
  assert.equal(await api.availability(settings({ provider: 'gemini', apis: { gemini: { key: 'k', model: '', baseUrl: '' } } })), 'needs-setup');
  assert.equal(await api.availability(settings({ provider: 'gemini', apis: { gemini: { key: 'k', model: 'm', baseUrl: '' } } })), 'ready');
  assert.equal(await api.availability(settings({ provider: 'custom', apis: { custom: { key: '', model: 'm', baseUrl: '' } } })), 'needs-setup');
  assert.equal(await api.availability(settings({ provider: 'custom', apis: { custom: { key: '', model: 'm', baseUrl: 'http://localhost:1234/v1/' } } })), 'ready');
  assert.equal(endpoint(settings({ provider: 'custom', apis: { custom: { key: '', model: 'm', baseUrl: 'http://localhost:1234/v1/' } } })).base, 'http://localhost:1234/v1');
});

test('keys are kept per provider, so switching does not lose one', () => {
  const s = settings({ provider: 'openai', apis: { openai: { key: 'a', model: 'x', baseUrl: '' }, groq: { key: 'b', model: 'y', baseUrl: '' } } });
  assert.equal(apiConfig(s).key, 'a');
  assert.equal(apiConfig({ ...s, provider: 'groq' }).key, 'b');
  assert.equal(apiConfig({ ...s, provider: 'mistral' }).key, '');
});

test('an OpenAI-compatible provider is called with the key, the model and a stream, and its text streams back', async () => {
  let seen: { url: string; auth: string | null; body: { model: string; stream: boolean; messages: { role: string }[] } } | undefined;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen = { url, auth: new Headers(init.headers).get('authorization'), body: JSON.parse(String(init.body)) };
    const sse = 'data: {"choices":[{"delta":{"content":"I made"}}]}\n\ndata: {"choices":[{"delta":{"content":" a tool."}}]}\n\ndata: [DONE]\n\n';
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as typeof fetch;
  const s = settings({ provider: 'groq', apis: { groq: { key: 'gsk_test', model: 'some-model', baseUrl: '' } } });
  const streamed: string[] = [];
  const out = await api.correct('i make a tool.', { system: 'SYS', user: (t) => `Correct: ${t}` }, s, (t) => streamed.push(t), new AbortController().signal);
  assert.equal(out, 'I made a tool.');
  assert.deepEqual(streamed, ['I made', 'I made a tool.']);
  assert.equal(seen!.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(seen!.auth, 'Bearer gsk_test');
  assert.equal(seen!.body.model, 'some-model');
  assert.equal(seen!.body.stream, true);
  assert.deepEqual(seen!.body.messages.map((m) => m.role), ['system', 'user']);
});

test('a rejected key or an unknown model is said plainly, with the provider\'s name', async () => {
  const s = settings({ provider: 'mistral', apis: { mistral: { key: 'bad', model: 'm', baseUrl: '' } } });
  globalThis.fetch = (async () => new Response('{"message":"Unauthorized"}', { status: 401 })) as typeof fetch;
  await assert.rejects(api.correct('x', { system: '', user: (t) => t }, s, () => {}, new AbortController().signal), /Mistral did not accept the API key/);
  globalThis.fetch = (async () => new Response('no', { status: 404 })) as typeof fetch;
  await assert.rejects(api.correct('x', { system: '', user: (t) => t }, s, () => {}, new AbortController().signal), /does not know that model/);
});

test('the model list comes from the provider, without the models that cannot chat', async () => {
  globalThis.fetch = (async () => Response.json({ data: [{ id: 'models/gemini-pro-x' }, { id: 'text-embedding-9' }, { id: 'whisper-2' }, { id: 'a-chat-model' }] })) as typeof fetch;
  const s = settings({ provider: 'gemini', apis: { gemini: { key: 'k', model: '', baseUrl: '' } } });
  assert.deepEqual(await listModels(s), ['a-chat-model', 'gemini-pro-x']);
});

test('settings saved by 0.1.0 carry their keys over', async () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
  store.set('unpolished.settings', JSON.stringify({ engine: 'openai', anthropicKey: 'sk-ant-1', anthropicModel: 'claude-x', openaiKey: 'sk-2', openaiModel: 'gpt-y' }));
  const { load } = await import('../src/settings');
  const s = await load();
  assert.equal(s.engine, 'api');
  assert.equal(s.provider, 'openai');
  assert.deepEqual(s.apis.anthropic, { key: 'sk-ant-1', model: 'claude-x', baseUrl: '' });
  assert.deepEqual(s.apis.openai, { key: 'sk-2', model: 'gpt-y', baseUrl: '' });
  assert.equal((s as unknown as Record<string, unknown>).openaiKey, undefined);
});

test('the panel names where the text goes: the provider, or for Other the server itself', () => {
  assert.equal(api.name(settings({ provider: 'gemini' })), 'Gemini, with your key');
  const custom = settings({ provider: 'custom', apis: { custom: { key: '', model: 'm', baseUrl: 'http://127.0.0.1:11435/v1' } } });
  assert.equal(api.name(custom), '127.0.0.1:11435, OpenAI-compatible');
});
