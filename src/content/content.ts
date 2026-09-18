/**
 * The page side. Injected only when the user asks (right-click, the shortcut) unless they turned on "everywhere".
 * A small stamp sits in the corner of the text field in use; it opens the panel beside the page, in an iframe of
 * the extension's own page, so the page's CSS cannot touch it and the page's scripts cannot read it. The correction
 * goes back with insertText, so Ctrl+Z undoes it and frameworks see a normal edit.
 */
type Field = HTMLTextAreaElement | HTMLInputElement | HTMLElement;
interface Grab { field: Field | null; text: string; start?: number; end?: number; range?: Range }

declare global { interface Window { __unpolished?: boolean } }
/** set by the build: the dev build leaves the shadow root open so it can be inspected */
declare const __DEV__: boolean;

const Z = '2147483647';
const TEXT_INPUTS = new Set(['text', 'search', '']);

function editableOf(el: Element | null): Field | null {
  if (!el) return null;
  if (el instanceof HTMLTextAreaElement) return el.readOnly || el.disabled ? null : el;
  if (el instanceof HTMLInputElement) return TEXT_INPUTS.has(el.type) && !el.readOnly && !el.disabled ? el : null;
  if (el instanceof HTMLElement && el.isContentEditable) {
    let root: HTMLElement = el;
    while (root.parentElement?.isContentEditable) root = root.parentElement;
    return root;
  }
  return null;
}

const isPlain = (f: Field): f is HTMLTextAreaElement | HTMLInputElement => f instanceof HTMLTextAreaElement || f instanceof HTMLInputElement;

function grab(field: Field | null): Grab {
  if (field && isPlain(field)) {
    const s = field.selectionStart ?? 0, e = field.selectionEnd ?? 0;
    return e > s ? { field, text: field.value.slice(s, e), start: s, end: e } : { field, text: field.value };
  }
  const sel = getSelection();
  const r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  if (field) {
    if (r && !r.collapsed && field.contains(r.commonAncestorContainer)) return { field, text: sel!.toString(), range: r.cloneRange() };
    return { field, text: field.innerText };
  }
  // no field: selected text on a page, corrected to copy
  return { field: null, text: r && !r.collapsed ? sel!.toString() : '' };
}

function writeBack(g: Grab, text: string): void {
  const f = g.field;
  if (!f) return;
  f.focus();
  if (isPlain(f)) {
    if (g.start !== undefined && g.end !== undefined) f.setSelectionRange(g.start, g.end); else f.select();
    if (!document.execCommand('insertText', false, text)) {
      f.setRangeText(text, g.start ?? 0, g.end ?? f.value.length, 'end');
      f.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return;
  }
  const sel = getSelection()!;
  sel.removeAllRanges();
  if (g.range) sel.addRange(g.range);
  else { const r = document.createRange(); r.selectNodeContents(f); sel.addRange(r); }
  if (!document.execCommand('insertText', false, text)) { f.innerText = text; f.dispatchEvent(new InputEvent('input', { bubbles: true })); }
}

const CSS = `
:host { all: initial; }
.btn { position: fixed; z-index: ${Z}; width: 30px; height: 30px; border-radius: 50%; border: 0; padding: 0; cursor: pointer;
  background: #1d1a16; color: #f5efe3; box-shadow: 2px 2px 0 #c8372d, 0 6px 16px -6px rgba(0,0,0,.45);
  font: italic 700 16px/1 Georgia, "Iowan Old Style", serif; display: grid; place-items: center;
  opacity: 0; transform: scale(.8); pointer-events: none; transition: opacity .15s, transform .15s; }
.btn.show { opacity: 1; transform: none; pointer-events: auto; }
.btn:hover { transform: translate(-1px,-1px) rotate(-8deg); box-shadow: 3px 3px 0 #c8372d, 0 8px 18px -6px rgba(0,0,0,.5); }
.btn .c { position: absolute; bottom: 3px; right: 5px; color: #ff7462; font: 400 10px/1 Georgia, serif; font-style: normal; }
.btn.shake { animation: shake .35s; }
@keyframes shake { 25% { transform: translateX(-3px) rotate(-6deg); } 75% { transform: translateX(3px) rotate(6deg); } }
.tip { position: fixed; z-index: ${Z}; background: #1d1a16; color: #f5efe3; font: 500 12px/1.2 system-ui, sans-serif; padding: 6px 9px; border-radius: 8px; pointer-events: none; opacity: 0; transition: opacity .15s; white-space: nowrap; }
.tip.show { opacity: 1; }
iframe { position: fixed; z-index: ${Z}; top: 12px; right: 12px; bottom: 12px; width: min(440px, calc(100vw - 24px)); height: calc(100vh - 24px); border: 0; background: transparent; color-scheme: normal; }
`;

function init(): void {
  const host = document.createElement('unpolished-root');
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:' + Z;
  const root = host.attachShadow({ mode: __DEV__ ? 'open' : 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Unpolish this text');
  btn.innerHTML = 'U<span class="c">‸</span>';
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.textContent = 'Fix my English, keep my voice';
  root.append(style, btn, tip);
  document.documentElement.append(host);

  let field: Field | null = null;
  let frame: HTMLIFrameElement | null = null;
  let hideTimer = 0;

  const place = (): void => {
    if (!field || !field.isConnected) { btn.classList.remove('show'); return; }
    const r = field.getBoundingClientRect();
    if (r.width < 60 || r.height < 18) { btn.classList.remove('show'); return; }
    const inside = r.height >= 48;
    // keep clear of the field's own scrollbar and resize handle
    const scrollbar = field.offsetWidth - field.clientWidth;
    const x = inside ? r.right - 38 - Math.max(0, scrollbar - 2) : r.right + 6;
    const y = inside ? r.bottom - 38 : r.top + (r.height - 30) / 2;
    btn.style.left = `${Math.min(Math.max(x, 4), innerWidth - 34)}px`;
    btn.style.top = `${Math.min(Math.max(y, 4), innerHeight - 34)}px`;
    tip.style.left = `${Math.max(parseFloat(btn.style.left) - 150, 4)}px`;
    tip.style.top = `${parseFloat(btn.style.top) - 30}px`;
  };
  let raf = 0;
  const schedule = (): void => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };

  document.addEventListener('focusin', (ev) => {
    const f = editableOf(ev.target as Element);
    if (!f) return;
    clearTimeout(hideTimer);
    field = f;
    place();
    btn.classList.add('show');
  }, true);
  document.addEventListener('focusout', () => {
    hideTimer = window.setTimeout(() => { if (!frame && !btn.matches(':hover')) btn.classList.remove('show'); }, 250);
  }, true);
  addEventListener('scroll', schedule, true);
  addEventListener('resize', schedule);
  document.addEventListener('input', schedule, true);

  btn.addEventListener('mousedown', (ev) => ev.preventDefault()); // keep the focus, and the selection, in the field
  btn.addEventListener('mouseenter', () => tip.classList.add('show'));
  btn.addEventListener('mouseleave', () => tip.classList.remove('show'));
  btn.addEventListener('click', () => open(field));

  const close = (): void => {
    frame?.remove();
    frame = null;
    removeEventListener('message', onMessage);
    field?.focus();
  };

  let current: Grab | null = null;
  let nonce = '';
  const panelOrigin = new URL(chrome.runtime.getURL('')).origin;

  function onMessage(ev: MessageEvent): void {
    const d = ev.data as { type?: string; nonce?: string; text?: string };
    if (!frame || ev.source !== frame.contentWindow || d?.nonce !== nonce) return;
    if (d.type === 'unpolished:ready') frame.contentWindow!.postMessage({ type: 'unpolished:text', nonce, text: current!.text, canReplace: !!current!.field }, panelOrigin);
    else if (d.type === 'unpolished:replace' && typeof d.text === 'string') { const g = current!; close(); writeBack(g, d.text); }
    else if (d.type === 'unpolished:close') close();
  }

  function open(f: Field | null): void {
    const g = grab(f);
    if (!g.text.trim()) { btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 400); return; }
    if (frame) close();
    current = g;
    nonce = crypto.randomUUID();
    frame = document.createElement('iframe');
    frame.src = `${chrome.runtime.getURL('panel.html')}#inject=${nonce}`;
    frame.setAttribute('allow', 'clipboard-write');
    frame.title = 'Unpolished';
    root.append(frame);
    addEventListener('message', onMessage);
    btn.classList.remove('show');
  }

  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && frame) close(); }, true);

  // the right-click menu and the shortcut arrive through the service worker
  chrome.runtime.onMessage?.addListener((msg: { type?: string }) => {
    if (msg?.type === 'unpolished:open') open(field ?? editableOf(document.activeElement));
  });

  // injected into a field that already has the focus: show the stamp straight away
  const active = editableOf(document.activeElement);
  if (active) { field = active; place(); btn.classList.add('show'); }
}

if (!window.__unpolished) { window.__unpolished = true; init(); }

export {};
