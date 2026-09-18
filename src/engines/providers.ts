/**
 * The APIs a user can bring their own key for. Claude has its own API; the rest speak the OpenAI chat completions
 * protocol, so one client serves them all, and "Other" takes any address that does (LM Studio, vLLM, a proxy).
 * No model names are written here: they change too often. The options page asks the provider for its list.
 * Every base URL was checked to answer on /models (401 or 400 without a key, not 404) on 2026-09-19.
 */
export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'mistral' | 'groq' | 'deepseek' | 'openrouter' | 'xai' | 'together' | 'custom';

export interface Provider {
  id: ProviderId;
  /** as the user knows it */
  name: string;
  /** empty for custom: the user gives it */
  baseUrl: string;
  /** where to get a key */
  keysAt: string;
  /** the protocol */
  kind: 'anthropic' | 'openai-compatible';
  /** a local server may not want a key */
  keyOptional?: boolean;
}

export const PROVIDERS: Provider[] = [
  { id: 'anthropic', name: 'Claude (Anthropic)', baseUrl: 'https://api.anthropic.com', keysAt: 'https://console.anthropic.com/settings/keys', kind: 'anthropic' },
  { id: 'openai', name: 'ChatGPT (OpenAI)', baseUrl: 'https://api.openai.com/v1', keysAt: 'https://platform.openai.com/api-keys', kind: 'openai-compatible' },
  { id: 'gemini', name: 'Gemini (Google)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keysAt: 'https://aistudio.google.com/apikey', kind: 'openai-compatible' },
  { id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', keysAt: 'https://console.mistral.ai/api-keys', kind: 'openai-compatible' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', keysAt: 'https://console.groq.com/keys', kind: 'openai-compatible' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', keysAt: 'https://platform.deepseek.com/api_keys', kind: 'openai-compatible' },
  { id: 'openrouter', name: 'OpenRouter (many models, one key)', baseUrl: 'https://openrouter.ai/api/v1', keysAt: 'https://openrouter.ai/keys', kind: 'openai-compatible' },
  { id: 'xai', name: 'Grok (xAI)', baseUrl: 'https://api.x.ai/v1', keysAt: 'https://console.x.ai', kind: 'openai-compatible' },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', keysAt: 'https://api.together.ai/settings/api-keys', kind: 'openai-compatible' },
  { id: 'custom', name: 'Other (OpenAI-compatible)', baseUrl: '', keysAt: '', kind: 'openai-compatible', keyOptional: true },
];

export const providerById = (id: ProviderId): Provider => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]!;
