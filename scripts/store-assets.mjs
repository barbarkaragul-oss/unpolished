// Web Store images from the real extension: the page panel on a forum reply and on an email, the settings, the
// promo tile and the store icon. Runs the dev build in a headless Chrome with its own throwaway profile; the
// corrections come from a real model (Ollama's OpenAI-compatible endpoint), so the shots show what users get.
//   node scripts/store-assets.mjs [ollama base, default http://127.0.0.1:11434]
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { copyFileSync, mkdirSync, readdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const OLLAMA = process.argv[2] ?? 'http://127.0.0.1:11434';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DEV = path.resolve('dev-dist'), OUT = path.resolve('store/out');
mkdirSync(OUT, { recursive: true });

execSync('npx tsx scripts/build.ts --dev', { stdio: 'inherit' });
for (const f of readdirSync('store').filter((f) => f.endsWith('.html'))) copyFileSync(path.join('store', f), path.join(DEV, f));

// the store icon: 96 px of artwork in 16 px of transparent padding, as the Web Store asks
const svg = readFileSync('src/icons/icon.svg', 'utf8').replace('viewBox="0 0 128 128"', 'viewBox="-21.33 -21.33 170.67 170.67"');
writeFileSync(path.join(OUT, 'store-icon-128.png'), new Resvg(svg, { fitTo: { mode: 'width', value: 128 } }).render().asPng());

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const p = path.join(DEV, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try { if ((await stat(p)).isDirectory()) throw 0; res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' }); res.end(await readFile(p)); } catch { res.writeHead(404); res.end(); }
}).listen(8791);
const BASE = 'http://localhost:8791';

const profile = path.join(os.tmpdir(), 'unpolished-store-shots');
rmSync(profile, { recursive: true, force: true });
const chrome = spawn(CHROME, [`--user-data-dir=${profile}`, '--headless=new', '--remote-debugging-port=9334', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ver;
for (let i = 0; i < 40 && !ver; i++) { await sleep(250); ver = await fetch('http://127.0.0.1:9334/json/version').then((r) => r.json()).catch(() => undefined); }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let n = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
const cdp = (method, params = {}, sessionId) => new Promise((res) => { const id = ++n; waiting.set(id, res); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });

async function page(url, width, height) {
  const t = (await cdp('Target.createTarget', { url: 'about:blank' })).result.targetId;
  const s = (await cdp('Target.attachToTarget', { targetId: t, flatten: true })).result.sessionId;
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, s);
  await cdp('Page.enable', {}, s);
  await cdp('Page.navigate', { url }, s);
  await sleep(1200);
  const run = async (expression) => {
    const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, s);
    if (r.result?.exceptionDetails) throw new Error(`${url}: ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}`);
    return r.result?.result?.value;
  };
  const shoot = async (name, format = 'jpeg') => {
    const r = await cdp('Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality: 92 } : {}), captureBeyondViewport: false }, s);
    writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'));
    console.log(`store/out/${name}`);
  };
  return { run, shoot };
}

const seed = (settings) => `localStorage.setItem('unpolished.settings', ${JSON.stringify(JSON.stringify(settings))}); location.reload(); true`;
const ollama = { engine: 'ollama', ollamaUrl: OLLAMA, ollamaModel: 'llama3:latest' };
// open the stamp on the text box, let the panel correct it, then show one of its tabs
const openAndFix = (tab) => `(async () => {
  await new Promise((r) => setTimeout(r, 800));
  const box = document.getElementById('box'); box.focus();
  if (box.setSelectionRange) box.setSelectionRange(box.value.length, box.value.length);
  await new Promise((r) => setTimeout(r, 200));
  const root = document.querySelector('unpolished-root').shadowRoot;
  root.querySelector('.btn').click();
  let d; for (let i = 0; i < 60 && !(d = root.querySelector('iframe')?.contentDocument)?.getElementById('engine-name'); i++) await new Promise((r) => setTimeout(r, 250));
  const t0 = Date.now();
  while ((!d.getElementById('view-clean').textContent || !d.getElementById('working').hidden) && Date.now() - t0 < 120000) await new Promise((r) => setTimeout(r, 500));
  d.querySelector('[data-tab=${tab}]').click();
  await new Promise((r) => setTimeout(r, 900));
  return d.getElementById('view-clean').textContent.slice(0, 80);
})()`;

try {
  const forum = await page(`${BASE}/forum.html`, 1280, 800);
  await forum.run(seed(ollama)); await sleep(1500);
  console.log('forum:', await forum.run(openAndFix('pen')));
  await forum.shoot('1-red-pen.jpg');

  const mail = await page(`${BASE}/mail.html`, 1280, 800);
  console.log('mail:', await mail.run(openAndFix('polish')));
  await mail.shoot('2-polish-check.jpg');

  const opts = await page(`${BASE}/options.html`, 1280, 800);
  await opts.run(seed({ engine: 'api', provider: 'anthropic', apis: { anthropic: { key: 'sk-ant-api03-not-a-real-key', model: 'claude-haiku-4-5', baseUrl: '' } } })); await sleep(1500);
  await opts.run(`(async () => { await new Promise((r) => setTimeout(r, 600)); document.querySelector('h2').scrollIntoView({ block: 'start' }); window.scrollBy(0, -18); return true; })()`);
  await opts.shoot('3-your-own-key.jpg');

  const tile = await page(`${BASE}/tile.html`, 440, 280);
  await sleep(600);
  await tile.shoot('promo-tile-440x280.jpg');
} finally {
  ws.close(); chrome.kill(); server.close();
  await sleep(800);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
