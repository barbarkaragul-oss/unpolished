/**
 * The user's own Anthropic key. The request goes from this extension straight to api.anthropic.com; there is no
 * server of ours in between. dangerouslyAllowBrowser is the SDK's switch for exactly this: the key is the user's,
 * kept in chrome.storage.local on their computer, not a key shipped in a web page.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Ask, Availability, Engine } from './types';
import { EngineError } from './types';
import type { Settings } from '../settings';

export const anthropic: Engine = {
  id: 'anthropic',
  label: 'Claude, with your key',
  where: 'cloud',
  async availability(s: Settings): Promise<Availability> {
    return s.anthropicKey.trim() ? 'ready' : 'needs-setup';
  },
  async correct(text: string, ask: Ask, s: Settings, onText, signal): Promise<string> {
    const client = new Anthropic({ apiKey: s.anthropicKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 1 });
    try {
      const stream = client.messages.stream({
        model: s.anthropicModel || 'claude-haiku-4-5',
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
      if (e instanceof Anthropic.RateLimitError) throw new EngineError('Anthropic is rate limiting this key.', 'Wait a minute and try again.');
      if (e instanceof Anthropic.APIConnectionError) throw new EngineError('Could not reach api.anthropic.com.', 'Check your connection.');
      throw e;
    }
  },
};
