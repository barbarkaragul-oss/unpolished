/**
 * Builds the extension into dist/ and the Web Store zip into release/. With --dev it builds into dev-dist/ with a
 * playground page that runs the page script and the panel without Chrome's extension APIs, for trying it in a tab.
 *   npx tsx scripts/build.ts [--dev]
 */
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { zipSync } from 'fflate';

const dev = process.argv.includes('--dev');
const OUT = path.resolve(dev ? 'dev-dist' : 'dist');
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
rmSync(OUT, { recursive: true, force: true });
for (const d of ['fonts', 'icons']) mkdirSync(path.join(OUT, d), { recursive: true });

const common = { bundle: true, target: ['chrome116'], minify: !dev, sourcemap: false, logLevel: 'warning' as const, legalComments: 'none' as const, define: { __DEV__: String(dev) } };
// extension pages and the service worker are modules; a script injected into a page cannot be
const pages = await build({ ...common, entryPoints: { panel: 'src/panel/panel.ts', options: 'src/options/options.ts', sw: 'src/sw.ts' }, format: 'esm', outdir: OUT });
const content = await build({ ...common, entryPoints: { content: 'src/content/content.ts' }, format: 'iife', outdir: OUT });
if (pages.errors.length || content.errors.length) process.exit(1);

for (const f of ['panel/panel.html', 'panel/panel.css', 'options/options.html', 'options/options.css']) copyFileSync(path.join('src', f), path.join(OUT, path.basename(f)));
const FONTS = 'node_modules/@fontsource-variable/fraunces/files';
copyFileSync(`${FONTS}/fraunces-latin-full-normal.woff2`, path.join(OUT, 'fonts', 'fraunces-normal.woff2'));
copyFileSync(`${FONTS}/fraunces-latin-full-italic.woff2`, path.join(OUT, 'fonts', 'fraunces-italic.woff2'));
copyFileSync('node_modules/@fontsource-variable/fraunces/LICENSE', path.join(OUT, 'fonts', 'LICENSE-Fraunces.txt'));

const svg = readFileSync('src/icons/icon.svg');
for (const size of [16, 32, 48, 128]) writeFileSync(path.join(OUT, 'icons', `icon-${size}.png`), new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());

const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8')) as Record<string, unknown>;
manifest.version = pkg.version;
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
cpSync('src/_locales', path.join(OUT, '_locales'), { recursive: true });

if (dev) {
  copyFileSync('dev/playground.html', path.join(OUT, 'index.html'));
  console.log(`dev build in ${path.relative('.', OUT)}/`);
} else {
  // the Web Store takes a zip of the extension's folder
  const files: Record<string, Uint8Array> = {};
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p); else files[path.relative(OUT, p).split(path.sep).join('/')] = readFileSync(p);
    }
  };
  walk(OUT);
  mkdirSync('release', { recursive: true });
  const zip = path.join('release', `unpolished-${pkg.version}.zip`);
  writeFileSync(zip, zipSync(files, { level: 9 }));
  const kb = (n: number): string => `${Math.round(n / 1024)} KB`;
  console.log(`dist/ built; ${zip} ${kb(statSync(zip).size)} (${Object.keys(files).length} files)`);
}
