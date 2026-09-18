/**
 * Brings the marker catalogue and its measured rates over from ../is-it-really-an-ai-tell. Nothing about which
 * markers are tells is written by hand here: the list is derived from data/markers.json every time this runs.
 *   npx tsx scripts/sync-markers.ts [path to the is-it-really-an-ai-tell checkout]
 *
 * A marker is a tell when machines use it clearly more (at least 8 points more, in the arm where they use it most)
 * AND at least twice as often as people. The second condition keeps out what most people do too: "every sentence
 * the same length" is in 100% of one model's texts but also in 74% of people's, so it tells a reader nothing.
 * A marker is a myth when people use it at least as often as the machines do (the dash, "moreover").
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const upstream = path.resolve(process.argv[2] ?? '../is-it-really-an-ai-tell');
const markersTs = path.join(upstream, 'src', 'markers.ts');
const markersJson = path.join(upstream, 'data', 'markers.json');
for (const f of [markersTs, markersJson]) if (!existsSync(f)) { console.error(`missing ${f}: pass the path of an is-it-really-an-ai-tell checkout`); process.exit(1); }

interface Arm { id: string; label: string; kind: 'human' | 'machine'; n: number }
interface Row { marker: string; label: string; family: string; belief?: boolean; share: Record<string, { arm: { n: number; pct: number } }> }
const data = JSON.parse(readFileSync(markersJson, 'utf8')) as { generated_at: string; arms: Arm[]; rows: Row[] };

const humans = data.arms.filter((a) => a.kind === 'human');
const machines = data.arms.filter((a) => a.kind === 'machine');
const best = (r: Row, arms: Arm[]): { pct: number; arm: Arm } => {
  let out = { pct: -1, arm: arms[0]! };
  for (const a of arms) { const s = r.share[a.id]; if (s && s.arm.n > 0 && s.arm.pct > out.pct) out = { pct: s.arm.pct, arm: a }; }
  return out;
};
const round = (x: number): number => Math.round(x * 10) / 10;

interface Tell { id: string; label: string; human: number; machine: number; machineArm: string }
interface Myth { id: string; label: string; human: number; machine: number; note: string }
const strong: Tell[] = [];
const myths: Myth[] = [];
for (const r of data.rows) {
  if (r.belief) continue;
  const h = best(r, humans), m = best(r, machines);
  if (h.pct < 0 || m.pct < 0) continue;
  if (m.pct - h.pct >= 8 && m.pct >= 2 * h.pct) {
    strong.push({ id: r.marker, label: r.label, human: round(h.pct), machine: round(m.pct), machineArm: m.arm.label.replace(/ \(.*$/, '').replace(/ via .*$/, '') });
  } else if (h.pct >= m.pct) {
    const note = h.pct === 0 && m.pct === 0
      ? 'it did not appear in the people\'s texts or in the models\' texts'
      : `people use it at least as often as the models do: ${round(h.pct)}% of people's texts, ${round(m.pct)}% of the models' at most`;
    myths.push({ id: r.marker, label: r.label, human: round(h.pct), machine: round(m.pct), note });
  }
}

let commit = 'unknown';
try { commit = execSync('git rev-parse --short HEAD', { cwd: upstream }).toString().trim(); } catch { /* not a git checkout */ }

const out = path.resolve('src', 'vendor');
mkdirSync(out, { recursive: true });
const header = `// Copied from is-it-really-an-ai-tell/src/markers.ts at ${commit} by scripts/sync-markers.ts. Do not edit here.\n`;
writeFileSync(path.join(out, 'markers.ts'), header + readFileSync(markersTs, 'utf8'));
writeFileSync(path.join(out, 'tells.json'), JSON.stringify({ source: `is-it-really-an-ai-tell@${commit}`, measured: data.generated_at, strong, myths }, null, 2) + '\n');
writeFileSync(path.join(out, 'UPSTREAM'), `${commit}\n`);
console.log(`tells: ${strong.map((t) => t.id).join(', ')}`);
console.log(`myths: ${myths.map((t) => t.id).join(', ')}`);
