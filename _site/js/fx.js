/* ───────────────────────────────────────────────────────────
   The Library · atmosphere
   dark → dust in the light     amber  → rising embers
   hacker → glyph rain          cyber  → neon sparks
   One small canvas at a time, 30 fps, paused when hidden or covered.
   ─────────────────────────────────────────────────────────── */
(function () {
'use strict';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
const back = document.getElementById('fxBack'), front = document.getElementById('fxFront');
if (!back || !front || !back.getContext) return;
const ctxB = back.getContext('2d'), ctxF = front.getContext('2d');

const MODE = { light: 'none', dark: 'dust', amber: 'embers', hacker: 'rain', cyber: 'sparks' };
const LAYER = { dust: 'front', embers: 'front', rain: 'back', sparks: 'back' };

let mode = 'none', cv = null, cx = null, W = 0, H = 0, S = 1;
let parts = [], cols = [], raf = 0, last = 0, t0 = performance.now();
let covered = false, hiddenTab = document.hidden;
const rnd = (a, b) => a + Math.random() * (b - a);

/* soft round sprite (drawn once per colour) */
const sprites = {};
function sprite(rgb) {
  if (sprites[rgb]) return sprites[rgb];
  const c = document.createElement('canvas'); c.width = c.height = 48;
  const g = c.getContext('2d'), gr = g.createRadialGradient(24, 24, 0, 24, 24, 24);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(.35, `rgba(${rgb},.45)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 48, 48);
  return (sprites[rgb] = c);
}

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789<>/{}[]=+*#$%&;:'.split('');
const FS = 15;

function size() {
  S = mode === 'rain' ? 1 : Math.min(devicePixelRatio || 1, 1.5);
  W = innerWidth; H = innerHeight;
  [back, front].forEach(c => { c.width = Math.round(W * S); c.height = Math.round(H * S); });
  if (mode === 'rain') {
    const n = Math.ceil(W / FS);
    cols = Array.from({ length: n }, (_, i) => newCol(i, true));
  }
}
function newCol(i, initial) {
  return { x: i * FS, y: initial ? rnd(-H / FS, H / FS) : rnd(-24, -2), v: rnd(5, 17), len: Math.round(rnd(7, 20)), g: Array.from({ length: 24 }, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]), t: 0 };
}
function spawn(p, initial) {
  const m = mode;
  if (m === 'dust') {
    p.x = rnd(0, W); p.y = initial ? rnd(0, H) : rnd(H * .9, H + 20); p.r = rnd(.7, 2.4); p.vx = rnd(-3, 7); p.vy = -rnd(2, 11);
    p.a = rnd(.14, .5); p.ph = rnd(0, 6.28); p.ts = rnd(.5, 1.6); p.rgb = '255,232,196';
  } else if (m === 'embers') {
    p.x = rnd(0, W); p.y = initial ? rnd(0, H) : rnd(H * .95, H + 30); p.r = Math.random() < .12 ? rnd(4, 9) : rnd(.9, 2.8);
    p.vx = rnd(-5, 7); p.vy = -rnd(7, 26); p.a = p.r > 3.5 ? rnd(.05, .12) : rnd(.25, .8); p.ph = rnd(0, 6.28); p.ts = rnd(.4, 1.4); p.rgb = Math.random() < .6 ? '255,170,66' : '255,214,130';
  } else if (m === 'sparks') {
    p.x = rnd(0, W); p.y = initial ? rnd(0, H) : rnd(H, H + 80); p.r = rnd(.7, 2.1); p.vx = rnd(-4, 4); p.vy = -rnd(18, 70);
    p.a = rnd(.2, .7); p.ph = rnd(0, 6.28); p.ts = rnd(.8, 2.2); p.len = rnd(6, 22);
    const k = Math.random(); p.rgb = k < .45 ? '25,227,255' : k < .85 ? '255,47,209' : '230,220,255';
  }
}
function count() {
  const f = Math.min(1.6, Math.max(.55, W / 1280));
  return { dust: 50, embers: 58, sparks: 42 }[mode] * f | 0;
}
function init() {
  parts = [];
  if (mode === 'dust' || mode === 'embers' || mode === 'sparks') {
    for (let i = 0, n = count(); i < n; i++) { const p = {}; spawn(p, true); parts.push(p); }
  }
}

function frame(now) {
  raf = 0;
  if (mode === 'none' || covered || hiddenTab) return;
  raf = requestAnimationFrame(frame);
  if (now - last < 30) return;
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  const t = (now - t0) / 1000;
  const c = cx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, back.width, front.height);

  if (mode === 'rain') {
    c.scale(S, S);
    c.font = FS + 'px ui-monospace,Consolas,monospace';
    c.textBaseline = 'top';
    for (let i = 0; i < cols.length; i++) {
      const k = cols[i]; k.y += k.v * dt; k.t += dt;
      if (k.t > .14) { k.t = 0; k.g[(Math.random() * k.g.length) | 0] = GLYPHS[(Math.random() * GLYPHS.length) | 0]; }
      if ((k.y - k.len) * FS > H) { cols[i] = newCol(i); continue; }
      for (let j = 0; j < k.len; j++) {
        const row = Math.floor(k.y) - j, py = row * FS;
        if (py < -FS || py > H) continue;
        const a = j === 0 ? .8 : Math.max(0, .42 * (1 - j / k.len));
        c.fillStyle = j === 0 ? `rgba(200,255,220,${a})` : `rgba(45,255,122,${a})`;
        c.fillText(k.g[(row % 24 + 24) % 24], k.x, py);
      }
    }
    return;
  }

  c.scale(S, S);
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    p.ph += dt * p.ts;
    p.x += (p.vx + Math.sin(p.ph) * (mode === 'embers' ? 9 : 3)) * dt;
    p.y += p.vy * dt;
    if (p.y < -30 || p.x < -30 || p.x > W + 30) { spawn(p, false); }
    let a = p.a * (.55 + .45 * Math.sin(p.ph * 1.7));
    const edge = Math.min(1, p.y / (H * .2), (H - p.y) / (H * .12) + .3);        // fade near the top
    a *= Math.max(0, edge);
    if (mode === 'dust') { const d = Math.abs(p.x - W / 2) / (W * .6); a *= 1 - Math.min(1, d) * .75; }
    if (a < .01) continue;
    c.globalAlpha = Math.min(1, a);
    if (mode === 'sparks') {
      c.strokeStyle = `rgba(${p.rgb},1)`; c.lineWidth = p.r * .8; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x, p.y + p.len); c.stroke();
      const s = p.r * 6; c.drawImage(sprite(p.rgb), p.x - s / 2, p.y - s / 2, s, s);
    } else {
      const s = p.r * (mode === 'embers' ? 7 : 5.5); c.drawImage(sprite(p.rgb), p.x - s / 2, p.y - s / 2, s, s);
    }
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}

function kick() { if (!raf && mode !== 'none' && !covered && !hiddenTab) { last = performance.now(); raf = requestAnimationFrame(frame); } }

function setMode(m) {
  if (REDUCE) m = 'none';
  mode = m;
  back.classList.remove('on'); front.classList.remove('on');
  ctxB.clearRect(0, 0, back.width, back.height); ctxF.clearRect(0, 0, front.width, front.height);
  if (m === 'none') { cv = cx = null; cancelAnimationFrame(raf); raf = 0; return; }
  const layer = LAYER[m]; cv = layer === 'back' ? back : front; cx = layer === 'back' ? ctxB : ctxF;
  cv.classList.add('on');
  size(); init(); kick();
}

document.addEventListener('themechange', e => setMode(MODE[e.detail.theme] || 'none'));
document.addEventListener('visibilitychange', () => { hiddenTab = document.hidden; kick(); });
document.addEventListener('libview', e => { covered = e.detail === 'detail' || e.detail === 'reader'; kick(); });
let rz = 0;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (mode !== 'none') { size(); init(); } }, 160); });

window.LibraryFX = { setMode };
setMode(MODE[root.getAttribute('data-theme')] || 'none');
})();
