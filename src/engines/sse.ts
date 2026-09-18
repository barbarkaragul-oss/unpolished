/**
 * Server-sent events as the OpenAI chat completions stream sends them: "data: {json}" lines, ended by
 * "data: [DONE]". Chunks can split a line anywhere, so lines are only read once they are complete.
 */
export function sseLines(onJson: (json: unknown) => void): (chunk: string) => void {
  let buf = '';
  return (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try { onJson(JSON.parse(data)); } catch { /* a keep-alive or a comment */ }
    }
  };
}

/** The text a chat completions stream chunk carries. */
export function deltaText(json: unknown): string {
  const j = json as { choices?: { delta?: { content?: string | null } }[] };
  return j.choices?.[0]?.delta?.content ?? '';
}
