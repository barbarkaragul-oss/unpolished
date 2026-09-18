/** The red-pen view: the writer's text with what was crossed out and what was written in. */
import { diffWordsWithSpace } from 'diff';

export type Mark = 'same' | 'del' | 'ins';
export interface Segment { text: string; mark: Mark }

export function redPen(before: string, after: string): Segment[] {
  const out: Segment[] = [];
  for (const c of diffWordsWithSpace(before, after)) {
    const mark: Mark = c.added ? 'ins' : c.removed ? 'del' : 'same';
    const last = out[out.length - 1];
    if (last && last.mark === mark) last.text += c.value;
    else out.push({ text: c.value, mark });
  }
  return out;
}

/** How many words were changed, for the headline: "7 corrections". */
export function corrections(segments: Segment[]): number {
  let n = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    if (s.mark === 'same' || !s.text.trim()) continue;
    // a deletion followed by an insertion is one correction, not two
    if (s.mark === 'ins' && segments[i - 1]?.mark === 'del' && segments[i - 1]!.text.trim()) continue;
    n++;
  }
  return n;
}
