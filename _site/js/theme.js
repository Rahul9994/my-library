/* ───────────────────────────────────────────────────────────
   The Library · theme manager
   light · dark · amber · hacker · cyber
   - saved in localStorage ("library.theme"), follows the OS until you choose
   - ?theme=cyber in the URL previews a theme without saving it
   - View Transitions reveal (circle / scan-line / neon sweep), with a fade fallback
   - T / Shift+T cycle, 1-5 pick while the picker is open
   ─────────────────────────────────────────────────────────── */
(function () {
'use strict';

const KEY = 'library.theme';
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const $ = id => document.getElementById(id);

const THEMES = [
  { key: 'light',  name: 'Light',  note: 'Ivory gallery',     meta: '#ecebe5', fav: ['#1d3bd1', '#f1ecdf'] },
  { key: 'dark',   name: 'Dark',   note: 'Midnight library',  meta: '#0d0d10', fav: ['#16161b', '#e6c98a'] },
  { key: 'amber',  name: 'Amber',  note: 'Lamp-lit study',    meta: '#1a0f07', fav: ['#2a1606', '#ffb347'] },
  { key: 'hacker', name: 'Hacker', note: 'Phosphor terminal', meta: '#020503', fav: ['#021208', '#2dff7a'] },
  { key: 'cyber',  name: 'Cyber',  note: 'Neon after-hours',  meta: '#0a0518', fav: ['#0e0722', '#19e3ff'] },
];
const byKey = k => THEMES.find(t => t.key === k);

const btn = $('themeBtn'), panel = $('themePanel'), wrap = $('theme');
let cur = root.getAttribute('data-theme') || 'light';
if (!byKey(cur)) cur = 'light';
let saved = false;
try { saved = !!localStorage.getItem(KEY); } catch (_) {}
const listeners = [];
let vt = null, open = false, fadeBusy = false;

/* ── helpers ──────────────────────────────────────────── */
function favicon(t) {
  const [bg, fg] = t.fav;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='${bg}'/><rect x='7' y='6' width='5' height='20' rx='1' fill='${fg}'/><rect x='14' y='6' width='5' height='20' rx='1' fill='${fg}' opacity='.7'/><rect x='21' y='8' width='5' height='18' rx='1' fill='${fg}' transform='rotate(12 23 17)'/></svg>`;
  const link = $('favicon'); if (link) link.setAttribute('href', 'data:image/svg+xml,' + encodeURIComponent(svg));
}
function apply(name, quiet) {
  const prev = cur;
  cur = name;
  root.setAttribute('data-theme', name);
  const t = byKey(name);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', t.meta);
  favicon(t);
  markPanel();
  if (!quiet) listeners.forEach(fn => { try { fn(name, prev); } catch (_) {} });
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: name, prev } }));
}

/* ── the reveal ───────────────────────────────────────── */
function lineEl(id) {
  let el = $(id);
  if (!el) { el = document.createElement('i'); el.id = id; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); }
  return el;
}
function set(name, opts) {
  opts = opts || {};
  if (!byKey(name) || (name === cur && !opts.force)) return;
  if (opts.persist !== false) { try { localStorage.setItem(KEY, name); saved = true; } catch (_) {} }

  if (opts.instant || REDUCE) { apply(name); return; }

  const from = opts.from && opts.from.getBoundingClientRect ? opts.from.getBoundingClientRect() : null;
  const x = from ? from.left + from.width / 2 : innerWidth - 56, y = from ? from.top + from.height / 2 : 40;
  const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  // the bookcase has hundreds of lit spines to repaint: a flat curtain hides that work instead of animating it live
  if (!document.startViewTransition || root.getAttribute('data-view') === 'case') { curtain(name, x, y, R); return; }
  lineEl('vtLine'); lineEl('vtBar');
  if (vt) { try { vt.skipTransition(); } catch (_) {} }
  let t;
  try {
    t = vt = document.startViewTransition(() => { root.setAttribute('data-vt', name); apply(name); });
  } catch (_) { apply(name); return; }
  t.ready.then(() => {
    const dur = name === 'hacker' ? 950 : name === 'cyber' ? 1000 : 1150;
    const ease = 'cubic-bezier(.65,0,.2,1)';
    let clip, bar = null;
    if (name === 'hacker') {
      clip = ['inset(0 0 100% 0)', 'inset(0 0 0% 0)'];
      bar = ['#vtline', [{ transform: 'translateY(0)' }, { transform: `translateY(${innerHeight}px)` }]];
    } else if (name === 'cyber') {
      clip = ['inset(0 100% 0 0)', 'inset(0 0% 0 0)'];
      bar = ['#vtbar', [{ transform: 'translateX(0)' }, { transform: `translateX(${innerWidth}px)` }]];
    } else {
      clip = [`circle(0px at ${x}px ${y}px)`, `circle(${R}px at ${x}px ${y}px)`];
    }
    root.animate({ clipPath: clip }, { duration: dur, easing: ease, pseudoElement: '::view-transition-new(root)' });
    if (bar) root.animate(bar[1], { duration: dur, easing: ease, fill: 'forwards', pseudoElement: '::view-transition-new(' + bar[0].slice(1) + ')' });
  }).catch(() => {});
  t.finished.catch(() => {}).then(() => { root.removeAttribute('data-vt'); if (vt === t) vt = null; });
}
function settled(cb, max) {                  // call back once four smooth frames in a row show the page has finished repainting
  const t0 = performance.now(); let last = t0, ok = 0;
  const tick = t => { ok = t - last < 24 ? ok + 1 : 0; last = t; if (ok >= 4 || t - t0 > max) cb(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
function curtain(name, x, y, R) {          // a colour circle grows from the control, the theme changes underneath, the curtain lifts
  const f = $('tfade'); if (!f || fadeBusy) { apply(name); return; }
  fadeBusy = true; f.style.background = byKey(name).meta; f.style.opacity = '1';
  const a = f.animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${R}px at ${x}px ${y}px)` }], { duration: 480, easing: 'cubic-bezier(.65,0,.2,1)', fill: 'forwards' });
  a.onfinish = () => {
    apply(name);                                                    // the heavy restyle happens here, hidden behind the curtain
    settled(() => {
      const b = f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, easing: 'ease-in-out', fill: 'forwards' });
      b.onfinish = () => { f.getAnimations().forEach(x => x.cancel()); f.style.opacity = ''; fadeBusy = false; };
    }, 1400);
  };
}
function next(dir) { const i = THEMES.findIndex(t => t.key === cur); return THEMES[(i + (dir || 1) + THEMES.length) % THEMES.length].key; }

/* ── picker ───────────────────────────────────────────── */
function buildPanel() {
  panel.innerHTML = THEMES.map((t, i) =>
    `<button class="topt" role="radio" aria-checked="false" data-k="${t.key}" tabindex="-1" style="--i:${i}" data-cursor="btn">` +
    `<span class="tprev" data-theme="${t.key}" aria-hidden="true"><i class="pv-spot"></i><b></b><b></b><b></b><b></b><b></b><i class="pv-plank"></i></span>` +
    `<span class="tname">${t.name}<small>${t.note}</small></span><kbd aria-hidden="true">${i + 1}</kbd></button>`).join('');
  markPanel();
}
function markPanel() {
  Array.from(panel.children).forEach(b => {
    const on = b.dataset.k === cur;
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  });
}
function openPanel() {
  if (open) return;
  open = true; panel.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
  setTimeout(() => { const on = panel.querySelector('[aria-checked="true"]'); if (on && open) on.focus({ preventScroll: true }); }, 30);
  document.addEventListener('pointerdown', outside, true);
}
function closePanel(refocus) {
  if (!open) return;
  open = false; panel.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', outside, true);
  if (refocus) btn.focus({ preventScroll: true });
}
function outside(e) { if (!wrap.contains(e.target)) closePanel(false); }

btn.addEventListener('click', () => { open ? closePanel(false) : openPanel(); });
panel.addEventListener('click', e => {
  const o = e.target.closest('.topt'); if (!o) return;
  set(o.dataset.k, { from: o });
  if (innerWidth <= 720) setTimeout(() => closePanel(true), 500);
});
panel.addEventListener('keydown', e => {
  const items = Array.from(panel.children), i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
  else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
  else if (e.key === 'Tab') closePanel(false);
});

addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target, tag = (t && t.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
  if (open) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closePanel(true); return; }
    if (/^[1-5]$/.test(e.key)) { e.preventDefault(); set(THEMES[+e.key - 1].key, { from: panel.children[+e.key - 1] }); return; }
  }
  if (e.key === 't' || e.key === 'T') { e.preventDefault(); set(next(e.shiftKey ? -1 : 1), { from: btn }); btn.parentNode.classList.add('spin'); setTimeout(() => btn.parentNode.classList.remove('spin'), 900); }
}, true);

/* follow the OS until the visitor makes a choice */
const mq = matchMedia('(prefers-color-scheme: dark)');
const onScheme = () => { if (!saved && (cur === 'light' || cur === 'dark')) set(mq.matches ? 'dark' : 'light', { persist: false, instant: true }); };
if (mq.addEventListener) mq.addEventListener('change', onScheme); else if (mq.addListener) mq.addListener(onScheme);

buildPanel();
apply(cur, true);

window.LibraryTheme = {
  list: THEMES, get: () => cur, set, next,
  onChange: fn => listeners.push(fn),
};
})();
