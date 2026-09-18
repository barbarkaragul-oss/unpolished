/**
 * Small models wrap their answer ("Here is the corrected text:"), quote it, think out loud in <think> tags or fence it
 * as code. This takes all of that off, and tells whether the model added text it was told not to add.
 */
import { sentences } from '../vendor/markers';

const PREAMBLE = /^\s*(?:here(?:'s| is)\b[^\n]*?:|sure[,!]?[^\n]*?:|of course[,!]?[^\n]*?:|corrected(?: text| version)?:|revised(?: text| version)?:|the corrected[^\n]*?:|i['’]d be happy[^\n]*?:)\s*/i;

export function clean(raw: string, original: string): string {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fence = /^```[a-z]*\n([\s\S]*?)\n```$/i.exec(s);
  if (fence && !/^```/.test(original.trim())) s = fence[1]!.trim();
  const lines = s.split('\n');
  if (lines.length > 1 && PREAMBLE.test(lines[0]!) && lines[0]!.replace(PREAMBLE, '').trim() === '') s = lines.slice(1).join('\n').trim();
  else s = s.replace(PREAMBLE, '').trim();
  const quoted = /^(["“'])([\s\S]*)(["”'])$/.exec(s);
  if (quoted && !/^["“']/.test(original.trim())) s = quoted[2]!.trim();
  // keep the writer's own leading and trailing whitespace, which a model always drops
  const lead = /^\s*/.exec(original)![0], trail = /\s*$/.exec(original)![0];
  return lead + s + trail;
}

/** Did the model write more than it was asked to correct? More than one extra sentence, or a third longer. */
export function addedText(original: string, corrected: string): boolean {
  const a = sentences(original).length, b = sentences(corrected).length;
  return b > a + 1 || corrected.trim().length > original.trim().length * 1.35 + 20;
}
