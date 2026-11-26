/* ───────────────────────────────────────────────────────────
   The Library · Dynamic View  (theme key: "dynamic")

   1 books   a curved, endless carousel; the room takes the colour of the book in front
   2 inside  that book leaves the row and turns in space; its pages orbit it
   3 picks   it lands in a row of five
   4 stack   choose three and send them to your reading list

   app.js owns the catalogue, search, history and the slide reader; this file
   owns everything you see while the theme is on. It stays idle otherwise.
   ─────────────────────────────────────────────────────────── */
(function () {
'use strict';

const LIB = window.LIBRARY, gsap = window.gsap;
if (!LIB || !gsap) return;

const ALL = LIB.books, HUES = window.LIBRARY_TONES || {};
const BOOK = new Map(ALL.map(b => [b.id, b]));
const root = document.documentElement, body = document.body;
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(pointer: fine)').matches;
const HIDPI = (window.devicePixelRatio || 1) >= 1.5;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (n, m) => ((n % m) + m) % m;
const smooth = t => t * t * (3 - 2 * t);
const inOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const pad = (n, l = 2) => String(n).padStart(l, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const enc = p => p.split('/').map(encodeURIComponent).join('/');
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = iso => { const [y, m] = iso.split('-'); return MONTHS[+m - 1] + ' ' + y; };
const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };
const app = () => window.__lib;
// full-length books (PDF / EPUB) carry a `doc` record and count pages; the posts count slides
const count = (n, word) => `${n.toLocaleString('en')} ${word}${n === 1 ? '' : 's'}`;
const amount = b => count(b.slides, b.doc ? 'page' : 'slide');
function total(ids) {                                // "472 pages · 24 slides"
  let pages = 0, slides = 0;
  ids.forEach(id => { const b = BOOK.get(id); if (b.doc) pages += b.slides; else slides += b.slides; });
  return [pages && count(pages, 'page'), (slides || !pages) && count(slides, 'slide')].filter(Boolean).join(' · ');
}
const tagsOf = b => Array.from(new Set(b.tags));
const topicInfo = k => (LIB.topics || []).find(t => t.key === k) || { key: k, label: k, chip: k };
const typeInfo = k => (LIB.types || []).find(t => t.key === k) || { key: k, label: k };
const coverSrc = b => enc(HIDPI ? b.cover : b.thumb);
const GENERIC = /^(SQL|AI|BI|ML|Data|Python|Career|General) (Notes|Cheat Sheet|Guide|Book)$/;
// big type: the short title, unless it says too little (a post's generic label, or one edition among several)
const headline = b => (b.doc ? b.title.length <= 40 : GENERIC.test(b.short) && b.title.length <= 34) ? b.title : b.short;
const slideSrc = (b, i) => enc(b.dir + '/' + b.files[i]);

/* ── colour: every book gets a room colour, taken from its cover where it has one ── */
const PALETTE = { lav: '#b3a2cf', gold: '#deb76a', cocoa: '#c7a582', mint: '#9dcbb9', rose: '#e39caf', sky: '#9dbfe2', coral: '#eba58a', sage: '#b7c78e', peri: '#a8b0e1', aqua: '#90c8cc' };
const CYCLE = ['lav', 'gold', 'mint', 'rose', 'sky', 'cocoa', 'sage', 'coral', 'peri', 'aqua'];
const BY_TOPIC = { sql: ['sky', 'lav'], python: ['mint', 'gold'], ml: ['lav', 'sage'], ai: ['coral', 'peri'], bi: ['gold', 'cocoa'], data: ['aqua', 'sage'], career: ['sage', 'cocoa'],
  code: ['rose', 'peri'], dsa: ['peri', 'lav'], devops: ['sage', 'aqua'], linux: ['cocoa', 'gold'], security: ['coral', 'rose'], other: ['cocoa', 'peri'] };
const family = h => h < 0 ? null : h < 10 || h >= 322 ? 'rose' : h < 30 ? 'coral' : h < 66 ? 'gold' : h < 100 ? 'sage' : h < 172 ? 'mint' : h < 196 ? 'aqua' : h < 218 ? 'sky' : h < 250 ? 'peri' : 'lav';
function candidates(b) {
  const h = HUES[b.id] || [-1, -1], start = hash(b.id) % CYCLE.length;
  return [family(h[0]), family(h[1]), ...(BY_TOPIC[b.topic] || []), ...CYCLE.slice(start), ...CYCLE.slice(0, start)].filter(Boolean);
}
function assignTones(list) {                         // neighbours (and the two ends of the ring) never share a colour
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const avoid = [out[i - 1], out[i - 2], out[i - 3]];
    if (i >= list.length - 2) avoid.push(out[0]);
    if (i === list.length - 1) avoid.push(out[1]);
    out.push(candidates(list[i]).find(c => !avoid.includes(c)) || CYCLE[i % CYCLE.length]);
  }
  return out;
}
function mix(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(lerp(v, y[i], t)).toString(16).padStart(2, '0')).join('');
}

/* ── icons ─────────────────────────────────────────────── */
const ico = (d, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  arrow: ico('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  play: '<svg class="ico-play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
  pause: '<svg class="ico-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.6v14H7zm6.4 0H17v14h-3.6z"/></svg>',
  open: ico('<path d="M12 7.2C10.400 5.9 8.100 5.3 5 5.3V18c3.100 0 5.400.6 7 1.900 1.600-1.300 3.900-1.900 7-1.9V5.300c-3.100 0-5.400.6-7 1.9zM12 7.200v12.700"/>'),
  facts: ico('<path d="M9 7h10M9 12h10M9 17h10M5 7h.01M5 12h.01M5 17h.01"/>'),
  pages: ico('<path d="m12 4 8 4.200-8 4.200-8-4.2zM4.500 12.600 12 16.500l7.500-3.9M4.500 16.600 12 20.500l7.500-3.9"/>'),
  bolt: ico('<path d="M13 3 5.500 13.200H11L10.200 21 18 10.600h-5.600z"/>'),
  search: ico('<circle cx="10.500" cy="10.500" r="6.200"/><path d="M15.200 15.200 20 20"/>'),
  list: ico('<path d="M6.500 4.500h11v15.500L12 16.200 6.500 20z"/>'),
  filter: ico('<path d="M4 7h16M7 12h10M10 17h4"/>'),
  plus: ico('<path d="M12 5.500v13M5.500 12h13"/>', 'ico-plus'),
  check: ico('<path d="m5.500 12.500 4.200 4.200L18.500 8"/>', 'ico-check'),
  close: ico('<path d="m6.500 6.500 11 11M17.500 6.500l-11 11"/>'),
  again: ico('<path d="M19.500 12a7.500 7.500 0 1 1-2.200-5.300M19.500 4.500v4.700h-4.700"/>'),
};

/* ── state ─────────────────────────────────────────────── */
const SLOTS = 13;
const D = {
  built: false, on: false, topic: 'all', list: ALL, tones: [], cur: 0,
  pos: 0, target: 0, lastPos: NaN, spin: null, drag: null, wheelT: 0, force: true,
  y: 0, sy: 0, anim: null, lastScroll: 0, lastInput: 0, burstFrom: 0, prevY: 0, needSnap: false, touching: false,
  raf: 0, lastT: 0, sec: '', mode: '', step: -1, away: null, flying: null, deep: -1, orbit: false, hidCard: null,
  tone: '', pending: { tone: false, title: false }, toneAt: 0, titleAt: 0, heavyT: 0, caps: [],
  keys: { fly: '', floats: '', inside: '', orbit: '', shop: '', stack: '' },
  auto: false, autoT: 0, picks: [null, null, null], lastPick: -1, saved: [], adding: false, shuffling: false, hintT: 0, doneT: 0, stepT: 0,
  tilt: { x: 0, y: 0, tx: 0, ty: 0 }, par: { x: 0, y: 0, dirty: false }, panel: false, menu: false, returnFocus: null,
};
const M = {};                                        // measurements
let E = {};                                          // elements
const current = () => D.list[D.cur];

/* ── markup ────────────────────────────────────────────── */
const bookHTML = full => '<div class="dvb"><div class="dvb-f dvb-front"><img alt="" draggable="false" decoding="async"></div><div class="dvb-f dvb-spine"><span></span></div><div class="dvb-f dvb-edge"></div>' +
  (full ? '<div class="dvb-f dvb-back"></div><div class="dvb-f dvb-top"></div><div class="dvb-f dvb-bottom"></div>' : '') + '</div>';
const FLOAT_SPOTS = [                                // x, y (% of the screen), size, depth, blur, tilt, bob seconds : wide | narrow
  [[10.5, 23, 1.05, 26, 1.1, -12, 5.2], [11, 20.5, .8, 12, .8, -12, 5.2]],
  [[66, 17.5, .82, -18, .5, 10, 4.4], [64, 19.500, .6, -8, .6, 10, 4.4]],
  [[87, 21, .98, 30, 1, 14, 5.8], [89, 21.500, .76, 14, 1, 14, 5.8]],
  [[7.500, 75, .74, -22, 1.700, 9, 4.9], [12, 70.500, .6, -10, 1.400, 9, 4.9]],
  [[20.500, 88, .66, 16, 2.200, -8, 6.3], [88, 70, .56, 8, 1.800, -8, 6.3]],
];
const TEMPLATE = `
<div class="dv-bg" aria-hidden="true"><i class="dv-base"></i><div class="dv-ripples"></div><i class="dv-deep"></i><i class="dv-rings"></i></div>
<div class="dv-scroll" tabindex="-1">
  <section class="dv-sec dv-hero" aria-label="Books">
    <div class="dv-floats" aria-hidden="true">${FLOAT_SPOTS.map(() => '<span class="dv-float swap"><span></span></span>').join('')}</div>
    <div class="dv-car" role="group" aria-roledescription="carousel" aria-label="Books. Drag, or use the left and right arrow keys"></div>
    <button class="dv-go" type="button" aria-label="Look inside this book">${I.arrow}</button>
    <button class="dv-auto" type="button" aria-pressed="false">${'<i>' + I.play + I.pause + '</i>'}<span>Autoplay</span></button>
    <div class="dv-name" aria-hidden="true"></div>
    <p class="dv-sr" aria-live="polite"></p>
    <div class="dv-num" aria-hidden="true"></div>
  </section>
  <section class="dv-sec dv-inside" aria-label="Inside the book">
    <div class="dv-sticky">
      <div class="dv-stepnum" aria-hidden="true">01</div>
      <div class="dv-claims"><h2 class="dv-claim"></h2><h2 class="dv-claim"></h2></div>
      <div class="dv-side">
        <div class="dv-stepper" role="group" aria-label="Look around the book">
          <button type="button" data-step="0" aria-label="The cover">${I.open}</button>
          <button type="button" data-step="1" aria-label="Book facts">${I.facts}</button>
          <button type="button" data-step="2" aria-label="The pages">${I.pages}</button>
          <button type="button" data-step="3" aria-label="Read it">${I.bolt}</button>
        </div>
        <p class="dv-cap"></p>
      </div>
      <div class="dv-readwrap"><h2></h2><p></p><button class="dv-read" type="button"><span></span>${I.arrow}</button></div>
    </div>
  </section>
  <section class="dv-sec dv-shop" aria-label="Pick up a book">
    <div class="dv-shop-in">
      <h2 class="dv-h2"><span class="ln" style="--i:0"><span>Pick up</span></span><span class="ln" style="--i:1"><span>a book</span></span></h2>
      <div class="dv-aside"><p>Five picks from the shelf. Open your favourite, or stack a few for later.</p><button class="dv-more" type="button">${I.again}Five more</button></div>
      <div class="dv-cards"></div>
    </div>
  </section>
  <section class="dv-sec dv-stack" aria-label="Build your reading stack">
    <div class="dv-stk-in">
      <div class="dv-stk-l">
        <h2 class="dv-h2"><span class="ln" style="--i:0"><span>Build your</span></span><span class="ln" style="--i:1"><span><em class="dv-three" style="font-style:normal">3</em> book stack &amp;</span></span><span class="ln" style="--i:2"><span>read it later</span></span></h2>
        <div class="dv-swatches" role="group" aria-label="Choose books for your stack"></div>
        <button class="dv-add3" type="button" disabled><span></span><small></small></button>
        <p class="dv-hint" aria-live="polite"></p>
      </div>
      <div class="dv-spot">
        <i class="dv-glow" aria-hidden="true"></i>
        ${[0, 1, 2].map(i => `<div class="dv-seat s${i}"><div class="dv-pick"><img alt="" draggable="false"></div><button class="dv-x" type="button" data-seat="${i}" disabled aria-label="Empty place">${I.close}</button></div>`).join('')}
      </div>
      <p class="dv-credit">A personal reading library — every book is credited to its author &nbsp;/&nbsp; <a href="https://github.com/Rahul9994/my-library#credits-and-takedowns" target="_blank" rel="noopener">Credits ↗</a></p>
    </div>
  </section>
</div>
<div class="dv-fly" aria-hidden="true"><div class="dv-orbit"></div><div class="dv-flyer"><i class="dv-shadow"></i>${bookHTML(true)}</div></div>`;

function build() {
  D.built = true;
  const dv = document.createElement('div'); dv.className = 'dv'; dv.id = 'dv'; dv.innerHTML = TEMPLATE;
  const main = $('main'); main.parentNode.insertBefore(dv, main.nextSibling);

  // header: the section switch in the middle, the tools on the right (next to the theme button)
  const nav = document.createElement('nav'); nav.className = 'dv-nav dv-only'; nav.setAttribute('aria-label', 'Sections');
  nav.innerHTML = '<i class="dv-ind" aria-hidden="true"></i>' + [['books', 'Books'], ['inside', 'Inside'], ['shop', 'Picks'], ['stack', 'Stack']]
    .map(([k, l]) => `<button type="button" data-go="${k}">${l}${k === 'stack' ? '<b></b>' : ''}</button>`).join('');
  $('.top .brand').insertAdjacentElement('afterend', nav);
  const topR = $('.top-r'), theme = $('#theme');
  const make = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const search = make(`<button class="ctl dv-only dv-searchbtn" type="button" aria-label="Search the library" data-tip="Search" data-key="/">${I.search.replace('<svg', '<svg class="ico"')}</button>`);
  const topics = make(`<div class="dv-topics dv-only"><button class="dv-pill dv-topbtn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Filter by topic">${I.filter}<span>All topics</span></button><div class="dv-menu" role="radiogroup" aria-label="Topic"></div></div>`);
  const list = make(`<button class="ctl dv-only dv-listbtn" type="button" aria-label="Reading list" aria-haspopup="dialog" data-tip="Reading list" data-key="L">${I.list.replace('<svg', '<svg class="ico"')}<span class="dv-badge" aria-hidden="true"></span></button>`);
  const read = make('<button class="dv-pill dv-solid dv-only dv-readnow" type="button"><span>Read<em style="font-style:normal"> now</em></span></button>');
  topR.insertBefore(search, theme); topR.insertBefore(topics, theme); topR.insertBefore(list, theme); topR.appendChild(read);

  const scrim = make('<div class="dv-scrim"></div>');
  const panel = make(`<aside class="dv-panel" role="dialog" aria-label="Your reading list" aria-hidden="true" inert><header><h2>Reading list</h2><button class="dv-close" type="button" aria-label="Close">${I.close}</button></header><ul></ul><p class="empty">Nothing saved yet. Build a stack of three and add it here.</p></aside>`);
  body.appendChild(scrim); body.appendChild(panel);

  const q = s => $(s, dv);
  E = {
    dv, nav, ind: $('.dv-ind', nav), badge3: $('b', nav), search, topics, topBtn: $('.dv-topbtn', topics), menu: $('.dv-menu', topics), list, badge: $('.dv-badge', list), read, scrim, panel, ul: $('ul', panel), empty: $('.empty', panel),
    base: q('.dv-base'), ripples: q('.dv-ripples'), deep: q('.dv-deep'), rings: q('.dv-rings'), scroll: q('.dv-scroll'),
    floats: $$('.dv-float', dv), floatBox: q('.dv-floats'), car: q('.dv-car'), go: q('.dv-go'), auto: q('.dv-auto'), name: q('.dv-name'), sr: q('.dv-sr'), num: q('.dv-num'),
    stepnum: q('.dv-stepnum'), claimBox: q('.dv-claims'), claims: $$('.dv-claim', dv), side: q('.dv-side'), steps: $$('.dv-stepper button', dv), cap: q('.dv-cap'),
    readwrap: q('.dv-readwrap'), readTitle: q('.dv-readwrap h2'), readBy: q('.dv-readwrap p'), readBtn: q('.dv-read'),
    shop: q('.dv-shop'), cards: q('.dv-cards'), more: q('.dv-more'), stack: q('.dv-stack'), swatches: q('.dv-swatches'), add3: q('.dv-add3'), hint: q('.dv-hint'), glow: q('.dv-glow'), seats: $$('.dv-seat', dv),
    orbit: q('.dv-orbit'), flyer: q('.dv-flyer'), orbs: [],
  };
  E.flyShadow = $('.dv-shadow', E.flyer);
  E.fly = bookParts(E.flyer);

  E.car.innerHTML = Array(SLOTS).fill('<div class="dv-slot"><i class="dv-shadow"></i>' + bookHTML(false) + '</div>').join('');
  D.slots = $$('.dv-slot', E.car).map(el => Object.assign(bookParts(el), { el, shadow: el.firstChild, j: NaN, key: '', vis: false }));

  try { D.saved = JSON.parse(store.get('library.reading') || '[]').filter(id => BOOK.has(id)); } catch (_) { D.saved = []; }
  bind();
}
function bookParts(host) {
  const book = $('.dvb', host);
  return { book, front: $('.dvb-front', book), img: $('.dvb-front img', book), spine: $('.dvb-spine span', book), back: $('.dvb-back', book) };
}
function paintBook(p, b, tone, large) {
  const c = PALETTE[tone];
  p.book.style.setProperty('--spine', mix(c, '#000000', .36));
  p.book.style.setProperty('--back', mix(c, '#ffffff', .06));
  p.front.style.backgroundImage = `url(${b.lq})`;
  const im = p.img;
  im.classList.remove('on');
  im.onload = () => im.classList.add('on');
  im.src = large ? enc(b.cover) : coverSrc(b);
  if (im.complete && im.naturalWidth) im.classList.add('on');
  p.spine.textContent = b.short;
}

/* ── measuring ─────────────────────────────────────────── */
const SPREAD_W = [0, 1.01, 1.8, 2.5, 3.12, 3.68, 4.2], SPREAD_N = [0, .86, 1.47, 1.98, 2.42, 2.82, 3.18];
const KS = [1, .79, .72, .655, .59, .53, .47], KY = [0, .052, .108, .182, .272, .372, .48], KRZ = [0, 3.2, 7, 11.5, 15.5, 19, 22], KRY = [0, 14, 24, 35, 44, 52, 58];
const at = (t, a) => { const i = Math.min(t.length - 2, Math.floor(a)); return lerp(t[i], t[i + 1], a - i); };

function measure() {
  const W = E.scroll.clientWidth || innerWidth, H = E.scroll.clientHeight || innerHeight;
  const top = $('.top'), zoom = top ? parseFloat(getComputedStyle(top).zoom) || 1 : 1;
  const short = H <= 520 && innerWidth > 640;                             // a phone on its side
  const narrow = !short && (W <= 760 || W / H < .9), head = short ? 62 : Math.round((innerWidth <= 900 ? 108 : 84) * zoom), ratio = W / H;
  const tall = !narrow && ratio < 1.55;                                   // 4:3-ish: a little less room beside the title
  const wide = clamp(.175 + (1.78 - ratio) * .035, .175, .192);
  const cw = Math.round(clamp(narrow ? Math.min(W * .54, H * .36 * .8) : Math.min(W * wide, H * .47 * .8), 100, 470));
  const ch = Math.round(cw / .8);
  const carY = Math.round(Math.max(H * (narrow ? .405 : .425), head + ch / 2 + 8));
  const goY = Math.round(carY + ch / 2 + clamp(H * (narrow ? .062 : .082), 32, 100));
  const base = narrow ? clamp(W * .098, 28, 68) : clamp(H * .088, 30, 118);
  const nameY = Math.round(narrow ? Math.min(H - base * .78 - H * .018, (goY + 22 + H) / 2) : clamp(H * .845, goY + 26 + base * .5, H - base * .7));
  // inside: on narrow screens the book takes the room between the headline (above) and the step buttons (below)
  const from = head + H * .02 + Math.min(W * .08, H * .042) * 2.32 + 6, to = H - H * .028 - 92;
  const sh = Math.round(narrow ? Math.min(H * .41, W * .62 / .8, (to - from) / 1.15) : Math.min(H * (short ? .64 : .665), W * .35 / .8)), sw = Math.round(sh * .8);
  const sx = Math.round(narrow ? W * .5 : W * .565), sy = Math.round(narrow ? (from + to) / 2 : short ? head + (H - head) * .49 : H * .525);
  const k = clamp(window.devicePixelRatio || 1, 1, 2);                    // 3D books are built k times larger (see dynamic.css)
  Object.assign(M, { W, H, narrow, short, tall, head, cw, ch, carY, goY, base, nameY, sw, sh, sx, sy, k, P: ch * 3.8, spread: narrow ? SPREAD_N : SPREAD_W });
  const st = E.dv.style;
  for (const [name, v] of Object.entries({ dvh: H, head, cw, ch, sw, sh, sx, sy, 'car-y': carY, 'go-y': goY, 'name-y': nameY })) st.setProperty('--' + name, v + 'px');
  st.setProperty('--k', k);
  E.dv.classList.toggle('narrow', narrow);
  E.dv.classList.toggle('tall', tall);
  E.dv.classList.toggle('short', short);
  FLOAT_SPOTS.forEach((spot, i) => {
    const [x, y, s, d, blur, r, t] = spot[narrow ? 1 : 0], el = E.floats[i].style;
    for (const [k, v] of Object.entries({ x: x + '%', y: y + '%', s, d: d + 'px', blur: blur + 'px', r: r + 'deg', t: t + 's' })) el.setProperty('--' + k, v);
  });
  tops();
  fitRead();
}
/* narrow screens, last step: the book moves up (and shrinks if it must) to clear the title, credits and Read button */
function fitRead() {
  M.lift = 0; M.fit = 1;
  if (!M.narrow) return;
  const floor = M.H * .965 - E.readwrap.offsetHeight - 8;                 // laid out even while hidden
  M.fit = clamp((floor - M.head) / (M.sh * 1.22), .5, 1);                 // 1.22: the tilted book is taller than the book
  M.lift = Math.max(0, M.sy + M.sh * .61 * M.fit - floor);
}
function tops() { M.shopTop = E.shop.offsetTop; M.stackTop = E.stack.offsetTop; M.max = Math.max(0, E.scroll.scrollHeight - E.scroll.clientHeight); }

/* ── carousel ──────────────────────────────────────────── */
function bindSlot(s, j) {
  const i = mod(j, D.list.length), b = D.list[i], key = b.id + D.tones[i];
  s.j = j;
  if (s.key !== key) { s.key = key; paintBook(s, b, D.tones[i], false); }
}
function renderCar() {
  const N = D.list.length, p = D.pos, base = Math.round(p);
  const maxK = N >= 5 ? 5.2 : Math.floor(N / 2) + .49;             // a very short list is not repeated across the whole row
  for (let o = -6; o <= 6; o++) {
    const j = base + o, k = j - p, a = Math.abs(k), s = D.slots[mod(j, SLOTS)];
    const x = Math.sign(k) * at(M.spread, a) * M.cw;
    if (a > maxK || Math.abs(x) > M.W / 2 + M.cw) { if (s.vis) { s.vis = false; s.el.style.visibility = 'hidden'; } continue; }
    bindSlot(s, j);
    if (!s.vis) { s.vis = true; s.el.style.visibility = 'visible'; }
    const sc = at(KS, a), y = at(KY, a) * M.ch, dir = Math.sign(k), centre = clamp(1 - a, 0, 1);
    const rz = dir * at(KRZ, a), ry = dir * at(KRY, a) + D.tilt.y * centre, rx = D.tilt.x * centre;
    s.el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
    s.el.style.zIndex = 100 - Math.round(a * 10);
    s.el.style.opacity = D.away && a < .5 ? 0 : a < 3.4 ? 1 : clamp(1 - (a - 3.4) / .9, 0, 1).toFixed(3);   // the travelling book has taken the centre place
    s.book.style.transform = `scale(${(sc / M.k).toFixed(4)}) perspective(${(M.P * M.k).toFixed(0)}px) rotateZ(${rz.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg)`;
    s.shadow.style.transform = `translate3d(0,${(M.ch * .5 * sc + M.ch * .055).toFixed(1)}px,0) scale(${sc.toFixed(3)})`;
  }
}
function killSpin() { if (D.spin) { D.spin.kill(); D.spin = null; D.target = Math.round(D.target); D.pending.tone = D.pending.title = true; } }
function spinIn(delay = 0, turns = 3.3) {
  if (D.spin) { D.spin.kill(); D.spin = null; }
  if (REDUCE || D.list.length < 2) return;
  D.pos = D.cur - Math.min(turns, D.list.length - .7); D.target = D.cur; D.force = true;
  D.spin = gsap.to(D, { pos: D.cur, duration: 1.45, delay, ease: 'power3.out', onComplete() { D.spin = null; } });
}
function interacted() { D.autoT = 0; }
function step(d) { killSpin(); D.target = Math.round(D.target) + d; interacted(); }
function goTo(idx, instant) {
  const N = D.list.length, from = Math.round(D.target);
  let d = mod(idx - from, N); if (d > N / 2) d -= N;
  const r = from + d;
  killSpin();
  if (instant || REDUCE) { D.pos = D.target = r; } else { if (Math.abs(d) > 6) D.pos = r - Math.sign(d) * 6; D.target = r; }
  D.force = true;
}
function checkActive(now) {
  const idx = mod(Math.round(D.pos), D.list.length);
  if (idx !== D.cur) { D.cur = idx; D.pending.tone = D.pending.title = true; }
  const err = D.drag ? Math.abs(D.pos - Math.round(D.pos)) : Math.abs(D.target - D.pos);
  // during a fast flick the colour and the title keep pace, but not faster than the eye can follow
  if (D.pending.tone && err < .55 && now - D.toneAt > 230) { D.pending.tone = false; D.toneAt = now; setTone(D.tones[D.cur]); }
  if (D.pending.title && err < .26 && now - D.titleAt > 180) {
    D.pending.title = false; D.titleAt = now; setTitle(current()); setNumber(current());
    clearTimeout(D.heavyT); D.heavyT = setTimeout(() => D.on && refresh(), 260);        // the rest of the page follows once the row has settled
  }
}

/* ── the room: colour, title, number ───────────────────── */
function themeColor() {
  const m = $('meta[name=theme-color]'); if (!m || !D.on) return;
  m.setAttribute('content', D.mode === 'dark' ? '#0a0c11' : D.mode === 'cream' ? '#fffcf3' : PALETTE[D.tone] || '#b3a2cf');
}
function setTone(tone, instant) {
  if (tone === D.tone && !instant) return;
  D.tone = tone;
  const c = PALETTE[tone];
  E.deep.style.background = mix(c, '#000000', .42);
  themeColor();
  if (instant || REDUCE || !E.base.animate) { E.ripples.textContent = ''; E.base.style.background = c; return; }
  // a soft disc of the new colour blooms from behind the book until it fills the room
  const x = M.W / 2, y = M.carY, far = Math.hypot(Math.max(x, M.W - x), Math.max(y, M.H - y)), size = 240, reach = far / .6 / (size / 2);
  const r = document.createElement('i'); r.className = 'dv-ripple';
  r.style.cssText = `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;right:auto;bottom:auto;background:radial-gradient(closest-side,${c} 0,${c} 60%,${c}00 100%)`;
  E.ripples.appendChild(r);
  const a = r.animate([{ transform: 'scale(.5)', opacity: 0 }, { opacity: 1, offset: .2 }, { transform: `scale(${reach.toFixed(2)})`, opacity: 1 }], { duration: 780, easing: 'cubic-bezier(.42,.05,.24,1)', fill: 'forwards' });
  a.onfinish = () => {
    if (!r.isConnected) return;
    E.base.style.background = c;
    while (E.ripples.firstChild && E.ripples.firstChild !== r) E.ripples.firstChild.remove();
    r.remove();
  };
}
const splitChars = text => text.split(/\s+/).map(w => '<span class="w">' + Array.from(w).map(c => `<span class="c">${esc(c)}</span>`).join('') + '</span>').join(' ');
function fitTitle(el) {                              // one line beside the big number if it can, two if it must
  const long = pad(current().n).length > 2;
  const numW = M.H * (M.tall ? (long ? .12 : .16) : (long ? .16 : .215)) * .72 * (long ? 3 : 2);
  const maxW = Math.round(M.narrow ? M.W * .92 : clamp(2 * (M.W * .44 - numW) - 24, M.W * .44, M.W * .72));
  let fs = M.base;
  el.style.width = ''; el.style.maxWidth = 'none';
  el.style.fontSize = fs + 'px';
  if (!M.narrow) {
    el.style.whiteSpace = 'nowrap';
    const w = el.offsetWidth;
    if (w <= maxW) return;
    if (maxW / w >= .7) { el.style.fontSize = fs * maxW / w + 'px'; return; }
    fs *= .8;
  }
  el.style.whiteSpace = 'normal'; el.style.maxWidth = maxW + 'px'; el.style.fontSize = fs + 'px';
  const widest = () => Math.max(...$$('.w', el).map(w => w.offsetWidth));
  for (let i = 0; i < 14 && (el.offsetHeight > fs * 2.4 || widest() > maxW); i++) { fs *= .92; el.style.fontSize = fs + 'px'; }
}
function setTitle(b, instant) {
  const box = E.name, live = box.querySelector('.dv-name-l:not(.out)');
  if (live && live.dataset.id === b.id && !instant) return;
  const el = document.createElement('span'); el.className = 'dv-name-l'; el.dataset.id = b.id; el.innerHTML = splitChars(headline(b));
  box.appendChild(el); fitTitle(el);
  E.sr.textContent = `${b.title}. ${topicInfo(b.topic).label}, ${amount(b)}.`;
  const olds = $$('.dv-name-l', box).filter(x => x !== el);
  olds.forEach(o => o.classList.add('out'));
  if (instant || REDUCE) { olds.forEach(o => o.remove()); return; }
  olds.forEach(o => {
    const c = $$('.c', o);
    gsap.to(c, { yPercent: -116, duration: .32, ease: 'power2.in', stagger: Math.min(.014, .18 / c.length), overwrite: true, onComplete() { o.remove(); } });
  });
  const c = $$('.c', el);
  gsap.fromTo(c, { yPercent: 116 }, { yPercent: 0, duration: .55, ease: 'power3.out', delay: olds.length ? .1 : 0, stagger: Math.min(.026, .34 / c.length) });
}
function setNumber(b, instant) {
  const t = pad(b.n);
  if (E.num.dataset.t === t) return;
  E.num.dataset.t = t;
  const put = () => { E.num.textContent = E.num.dataset.t; E.num.classList.toggle('long', E.num.dataset.t.length > 2); };
  gsap.killTweensOf(E.num);
  if (instant || REDUCE) { put(); gsap.set(E.num, { clearProps: 'opacity,y' }); return; }
  gsap.timeline()
    .to(E.num, { opacity: 0, y: -14, duration: .18, ease: 'power2.in' })
    .add(put)
    .fromTo(E.num, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: .55, ease: 'power3.out', immediateRender: false, clearProps: 'opacity,transform' });
}

/* ── everything that follows the chosen book ───────────── */
function refresh(force) {
  setFloats(current()); setInside(current()); setShop(force); setStack(force); mirror();
}
/* small things from inside a book: its pages (then close-ups of them, when it has only a few) and its labels */
const CLOSEUPS = ['12% 8%', '88% 38%', '24% 72%', '76% 92%', '50% 52%'];
function pieces(b, n) {
  const pages = []; for (let i = 1; i < b.files.length && pages.length < 8; i++) pages.push(i);
  if (!pages.length) pages.push(0);
  const labels = Array.from(new Set([...tagsOf(b).slice(0, 6).map(t => '#' + t), topicInfo(b.topic).label, amount(b), b.doc ? b.doc.license : typeInfo(b.type).label]));
  const out = []; let p = 0, l = 0, c = 0;
  for (let k = 0; k < n; k++) {
    if (k % 3 === 2 && l < labels.length) out.push({ label: labels[l++] });
    else if (p < pages.length) out.push({ page: pages[p++] });
    else if (c < CLOSEUPS.length) { out.push({ page: pages[c % pages.length], at: CLOSEUPS[c] }); c++; }
    else if (l < labels.length) out.push({ label: labels[l++] });
    else out.push({ page: pages[p++ % pages.length] });
  }
  return out;
}
const closeup = (b, it) => `<i class="dv-closeup" style="background-image:url('${slideSrc(b, it.page).replace(/'/g, '%27')}');background-position:${it.at}"></i>`;
function setFloats(b) {
  if (D.keys.floats === b.id) return;
  D.keys.floats = b.id;
  const set = pieces(b, E.floats.length);
  E.floats.forEach((f, i) => {
    f.classList.add('swap');
    setTimeout(() => {
      if (D.keys.floats !== b.id) return;
      const holder = f.firstElementChild, it = set[i];
      if (it.label) { holder.innerHTML = `<span class="dv-chip">${esc(it.label)}</span>`; f.classList.remove('swap'); return; }
      const im = new Image(); im.alt = ''; im.src = slideSrc(b, it.page);
      const show = () => {
        if (D.keys.floats !== b.id) return;
        if (it.at) holder.innerHTML = closeup(b, it); else holder.replaceChildren(im);
        f.classList.remove('swap');
      };
      im.decode ? im.decode().then(show, show) : (im.onload = show);
    }, REDUCE ? 0 : 240 + i * 45);
  });
}
function barcode(seed) {
  let h = hash(seed), x = 0, r = '';
  const rnd = () => (h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0);
  while (x < 98) { const w = 1 + rnd() % 3, g = 1 + rnd() % 2; r += `<rect x="${x}" width="${(w * .8).toFixed(1)}" height="30"/>`; x += w + g; }
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none" fill="currentColor">${r}</svg>`;
}
function factsHTML(b) {
  const d = b.doc, topic = topicInfo(b.topic).label, n = b.slides.toLocaleString('en');
  const rows = d
    ? [['Pages', n], ['Topic', topic], ['Format', `${d.fmt} · ${d.mb} MB`], d.edition ? ['Edition', d.edition] : ['Added', fmtDate(b.date)], ['Licence', d.license], ['Author', b.author || 'Unknown'], ['Shelf no.', pad(b.n, 3)]]
    : [['Slides', n], ['Topic', topic], ['Format', typeInfo(b.type).label], ['Added', fmtDate(b.date)], ['Shelf no.', pad(b.n, 3)], ['Author', b.author || 'Unknown'], ['Filler', '0 g']];
  const digits = (String(hash(b.id)) + String(hash(b.title))).slice(0, 12), tags = tagsOf(b);
  return `<div class="dv-facts"><p class="f-brand">The Library</p><p class="f-sub">${esc(b.short)}</p>` +
    `<div class="f-label"><b>Book facts</b><small>Serving size: 1 book${b.handle ? ' · ' + esc(b.handle) : ''}</small><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div>` +
    (tags.length ? `<p class="f-tags">Tags: ${esc(tags.join(', '))}</p>` : '') +
    `<div class="f-code">${barcode(b.id)}<span>${digits}</span></div><p class="f-foot">Packed, not padded</p></div>`;
}
function paintFlyer() {
  const b = current(), tone = D.tones[D.cur];
  if (D.keys.fly === b.id + tone) return;
  D.keys.fly = b.id + tone;
  paintBook(E.fly, b, tone, true);
  E.fly.back.innerHTML = factsHTML(b);
}
function setInside(b) {
  if (D.keys.inside === b.id) return;
  D.keys.inside = b.id;
  const d = b.doc, tags = tagsOf(b).slice(0, 3).map(t => '#' + t).join(' ') || topicInfo(b.topic).label;
  E.claims[0].textContent = d ? 'The whole\nbook, free' : b.slides === 1 ? 'One page,\nall signal' : 'Real notes,\nfirst';
  E.claims[1].textContent = d ? 'Cover to\ncover' : 'Packed,\nnot padded';     // two short lines: they sit beside the book
  D.caps = [`${tags}\nNothing you can’t learn.`, d ? `${amount(b)}.\n${d.fmt}, ${d.mb} MB.` : `${amount(b)}, no filler.\nJust the good part.`, '', ''];
  E.cap.textContent = D.caps[Math.max(0, D.step)] || '';
  E.readTitle.textContent = b.title;
  E.readBy.innerHTML = (b.author ? `By ${esc(b.author)}${b.handle ? ' · ' + esc(b.handle) : ''}` : '') + (d ? `<br>${esc(d.license)}` : '') +
    (b.source ? `<br><a href="${esc(b.source)}" target="_blank" rel="noopener">${d ? 'Official download' : 'View on ' + esc(b.sourceLabel || 'source')} ↗</a>` : '');
  E.readBtn.firstElementChild.textContent = d ? (d.fmt === 'EPUB' ? 'Open the EPUB' : 'Read the book') : b.slides === 1 ? 'Read this page' : `Read all ${b.slides} slides`;
  fitRead();                                        // long credits take more room under the book
}

/* ── the pages that orbit the book ─────────────────────── */
function buildOrbit(b) {
  D.keys.orbit = b.id + M.narrow;
  E.orbit.innerHTML = pieces(b, M.narrow ? 8 : 11).map(it => it.label
    ? `<div class="dv-orb"><span class="dv-chip">${esc(it.label)}</span></div>`
    : `<div class="dv-orb">${it.at ? closeup(b, it) : `<img alt="" decoding="async" src="${slideSrc(b, it.page)}">`}</div>`).join('');
  E.orbs = $$('.dv-orb', E.orbit).map(el => ({ el, z: 0, far: false }));
}
function renderOrbit(o, q, t) {
  const n = E.orbs.length, rx = Math.min(M.W * (M.narrow ? .39 : .34), M.sh * .8), ry = M.sh * .22, grow = .42 + .58 * smooth(o), turn = REDUCE ? 0 : t * .34;
  for (let i = 0; i < n; i++) {
    const it = E.orbs[i], a = i / n * Math.PI * 2 + turn + (q - 2) * 2.6, z = Math.sin(a), c = Math.cos(a);
    const x = M.sx + c * rx * grow, y = M.sy + M.sh * .05 + (z * ry - c * M.sh * .17) * grow;
    const s = (.46 + .66 * (z + 1) / 2) * (.55 + .45 * o);
    it.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${s.toFixed(3)}) rotate(${(Math.sin(a * 2 + i) * 14).toFixed(1)}deg)`;
    it.el.style.opacity = smooth(o).toFixed(3);
    const layer = z > 0 ? 14 : 6; if (layer !== it.z) { it.z = layer; it.el.style.zIndex = layer; }
    const far = z < -.35; if (far !== it.far) { it.far = far; it.el.classList.toggle('far', far); }
  }
}

/* ── the travelling book: carousel → inside → its card ─── */
const TURN = [-18, 162, 342, 702], TILT = 10.5;
function turnAt(q) { const i = Math.min(2, Math.floor(q)), f = smooth(clamp(q - i, 0, 1)); return lerp(TURN[i], TURN[i + 1], f); }
function targetCard() { return E.cards.querySelector(`[data-id="${current().id}"]`) || E.cards.children[E.cards.children.length >> 1] || null; }
function cardBox(card) {                             // layout position (ignores the entrance transform, so the landing is exact)
  const cv = card.querySelector('.dv-card-cv');
  let x = 0, y = 0, n = cv;
  while (n && n !== E.scroll) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x: x + cv.offsetWidth / 2 - E.cards.scrollLeft, y: y + cv.offsetHeight / 2 - D.y, h: cv.offsetHeight };
}
function stage(now) {
  const H = M.H, sy = D.sy, t = now / 1000;
  const t1 = clamp(sy / H, 0, 1), q = clamp((sy - H) / H, 0, 3), t2 = clamp((sy - 4 * H) / H, 0, 1);
  const away = t1 > .003, flying = away && t2 < .996;
  if (away !== D.away) { D.away = away; renderCar(); D.lastPos = D.pos; if (away) { setInside(current()); setShop(false); } }
  if (flying) paintFlyer();                          // repaints only when the chosen book has changed
  if (flying !== D.flying) { D.flying = flying; E.flyer.classList.toggle('on', flying); }
  const card = flying && t2 > 0 ? targetCard() : null;
  if (card !== D.hidCard) { if (D.hidCard) D.hidCard.classList.remove('flying'); if (card) card.classList.add('flying'); D.hidCard = card; }

  const passing = !!D.anim && Math.abs(D.anim.to - D.y) > H * 1.2;   // hurrying past on the way somewhere else
  const orb = passing ? 0 : clamp(1 - Math.abs(q - 2) / .8, 0, 1);
  if (flying) {
    const e1 = inOut(t1), e2 = inOut(t2), live = REDUCE ? 0 : e1 * (1 - e2);
    const last = smooth(clamp((q - 2.3) / .6, 0, 1));                      // easing into the last step
    const rest = M.sy - M.lift * last;
    let x = lerp(M.W / 2, M.sx, e1), y = lerp(M.carY, rest, e1), s = lerp(M.ch / M.sh, lerp(1, M.fit, last), e1);
    let ry = lerp(0, turnAt(q), e1), rz = lerp(0, TILT, e1), rx = 0;
    ry += live * (Math.sin(t * .85) * 5 + Math.sin(t * 1.05) * 30 * orb);       // it never sits perfectly still
    rz += live * Math.sin(t * .67) * 1.2; rx = live * Math.sin(t * .53) * 2.4; y += live * Math.sin(t * 1.25) * H * .007;
    if (card) {
      const c = cardBox(card);
      x = lerp(x, c.x, e2); y = lerp(y, c.y, e2); s = lerp(s, c.h / M.sh, e2);
      ry = lerp(ry, 720, e2); rz = lerp(rz, 0, e2); rx = lerp(rx, 0, e2);
    }
    E.flyer.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
    E.fly.book.style.transform = `scale(${(s / M.k).toFixed(4)}) perspective(${(M.P * M.k * M.sh / M.ch).toFixed(0)}px) rotateZ(${rz.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg)`;
    E.flyShadow.style.transform = `translate3d(0,${(M.sh * .5 * s + M.sh * .06).toFixed(1)}px,0) scale(${s.toFixed(3)})`;
    E.flyShadow.style.opacity = (1 - e1 * .45).toFixed(3);
  }

  const show = flying && orb > .01;
  if (show) { if (D.keys.orbit !== current().id + M.narrow) buildOrbit(current()); renderOrbit(orb, q, t); }
  else if (flying && q > .9 && D.keys.orbit !== current().id + M.narrow) buildOrbit(current());    // fetch the pages just before they are needed
  if (show !== D.orbit) { D.orbit = show; E.orbit.classList.toggle('on', show); }

  const numY = Math.round(M.sy - M.lift * smooth(clamp((q - 2.3) / .6, 0, 1)));
  if (numY !== D.numY) { D.numY = numY; E.stepnum.style.top = numY + 'px'; }
  const deep = +smooth(clamp((q - 1.2) / .65, 0, 1)).toFixed(3);
  if (deep !== D.deep) { D.deep = deep; E.deep.style.opacity = deep; }
  const rings = (1 - t1).toFixed(3); if (rings !== D.ringsO) { D.ringsO = rings; E.rings.style.opacity = rings; }

  const side = +(1 - smooth(clamp((q - 1.3) / .4, 0, 1))).toFixed(3);
  if (side !== D.sideO) {
    D.sideO = side;
    E.side.style.opacity = E.claimBox.style.opacity = side;
    E.side.style.visibility = side ? '' : 'hidden';
  }
  const stepNow = Math.round(q);
  if (!passing && stepNow !== D.step) setStep(stepNow);
  const cta = !passing && q > 2.55 && t2 < .22;
  if (cta !== D.cta) { D.cta = cta; E.readwrap.classList.toggle('on', cta); }
}
function setStep(n) {
  const first = D.step < 0;
  D.step = n;
  E.claims.forEach((c, i) => c.classList.toggle('on', i === n));
  E.steps.forEach((b, i) => { b.classList.toggle('on', i === n); if (i === n) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  clearTimeout(D.stepT);
  const put = () => { E.stepnum.textContent = pad(D.step + 1); E.cap.textContent = D.caps[D.step] || ''; E.stepnum.classList.remove('swap'); E.cap.classList.remove('swap'); };
  if (first || REDUCE) { put(); return; }
  E.stepnum.classList.add('swap'); E.cap.classList.add('swap');
  D.stepT = setTimeout(put, 200);
}

/* ── picks and stack ───────────────────────────────────── */
function featured() {                                // the chosen book in the middle, two neighbours either side
  const N = D.list.length, n = Math.min(5, N), half = n >> 1;
  return Array.from({ length: n }, (_, k) => mod(D.cur - half + k, N));
}
const toneOf = id => { const i = D.list.findIndex(b => b.id === id); return i >= 0 ? D.tones[i] : candidates(BOOK.get(id))[0]; };
function setShop(force) {
  const ids = featured(), key = ids.map(i => D.list[i].id + D.tones[i]).join('|');
  if (key === D.keys.shop) return;
  if (!force && D.sec === 'shop') return;            // never swap the cards under the reader's eyes
  D.keys.shop = key;
  E.more.style.display = D.list.length > 5 ? '' : 'none';
  E.cards.style.setProperty('--n', ids.length);
  E.cards.innerHTML = ids.map((i, k) => {
    const b = D.list[i];
    return `<article class="dv-card" data-id="${b.id}" style="--tone:${PALETTE[D.tones[i]]};--i:${k}"><h3>${esc(b.short)}</h3>` +
      `<button class="dv-card-open" type="button" data-open="${b.id}" aria-label="Look inside ${esc(b.title)}"><span class="dv-card-cv" style="background-image:url(${b.lq})"><img src="${enc(b.thumb)}" alt="" decoding="async" draggable="false"></span></button>` +
      `<button class="dv-add" type="button" data-pick="${b.id}" aria-pressed="false" aria-label="Add ${esc(b.title)} to your stack">${I.plus}${I.check}</button></article>`;
  }).join('');
  D.hidCard = null;
  syncPicks(); fitNames('.dv-card h3', 11); centreCards();
}
/* a title set in capitals never splits inside a word: shrink its type to fit (CSS ellipsis past the minimum) */
function fitNames(sel, min) {
  const els = $$(sel, E.dv);
  els.forEach(el => { el.style.fontSize = ''; });
  els.map(el => [el, el.clientWidth, el.scrollWidth]).forEach(([el, room, need]) => {
    if (room && need > room) el.style.fontSize = Math.max(min, parseFloat(getComputedStyle(el).fontSize) * room / need * .97).toFixed(2) + 'px';
  });
}
function centreCards() {
  const c = E.cards, mid = c.children[c.children.length >> 1];
  if (M.narrow && mid) c.scrollLeft = mid.offsetLeft - c.offsetLeft - (c.clientWidth - mid.offsetWidth) / 2;
}
function setStack(force) {
  const ids = featured(), key = ids.map(i => D.list[i].id + D.tones[i]).join('|');
  if (key === D.keys.stack) return;
  if (!force && D.sec === 'stack') return;
  D.keys.stack = key;
  E.swatches.innerHTML = ids.map((i, k) => {
    const b = D.list[i];
    return `<button class="dv-sw" type="button" data-pick="${b.id}" aria-pressed="false" style="--tone:${PALETTE[D.tones[i]]};--i:${k}" title="${esc(b.title)}" aria-label="${esc(b.title)}">` +
      `<span class="dv-sw-t"><img src="${enc(b.thumb)}" alt="" decoding="async" draggable="false"></span><span class="dv-sw-n">${esc(b.short)}</span><span class="dv-sw-r">${I.check}</span></button>`;
  }).join('');
  syncPicks(); fitNames('.dv-sw-n', 7);
}
const need = () => Math.min(3, Math.max(D.list.length, D.picks.filter(Boolean).length));
function syncPicks() {
  const chosen = D.picks.filter(Boolean), n = chosen.length, want = need();
  E.seats.forEach((seat, i) => {
    const id = D.picks[i], b = id && BOOK.get(id), im = $('img', seat), x = $('.dv-x', seat);
    if (b) { const src = enc(b.thumb); if (im.getAttribute('src') !== src) im.src = src; }
    seat.classList.toggle('full', !!b);
    x.disabled = !b || D.adding;
    x.setAttribute('aria-label', b ? `Remove ${b.title}` : 'Empty place');
  });
  $$('[data-pick]', E.dv).forEach(el => el.setAttribute('aria-pressed', D.picks.includes(el.dataset.pick) ? 'true' : 'false'));
  const label = E.add3.firstElementChild, small = E.add3.lastElementChild;
  E.add3.classList.toggle('done', D.adding);
  if (D.adding) { E.add3.disabled = true; label.textContent = 'Added to your list'; }
  else {
    const ready = n >= want && n > 0;
    E.add3.disabled = !ready;
    label.textContent = ready ? 'Add to reading list' : `Pick ${want - n} more`;
    small.textContent = total(chosen);
  }
  const last = D.lastPick >= 0 && D.picks[D.lastPick] ? D.picks[D.lastPick] : chosen[chosen.length - 1];
  if (!D.adding) E.glow.style.setProperty('--dv-glow', last ? PALETTE[toneOf(last)] : '#6f918a');
  if (E.badge3.textContent !== String(n)) {              // the badge changes the switch's width: move the pill with it
    E.badge3.textContent = n; E.badge3.classList.toggle('on', n > 0);
    if (D.sec) moveIndicator();
  }
}
function hint(text) {
  clearTimeout(D.hintT); E.hint.textContent = text;
  D.hintT = setTimeout(() => { E.hint.textContent = ''; }, 3200);
}
function bump(el, s = 1.28) { if (el.animate && !REDUCE) el.animate([{ scale: 1 }, { scale: s }, { scale: 1 }], { duration: 430, easing: 'cubic-bezier(.22,1,.36,1)' }); }
function togglePick(id, from) {
  if (D.adding) return;
  const i = D.picks.indexOf(id);
  if (i >= 0) { D.picks[i] = null; if (D.lastPick === i) D.lastPick = -1; syncPicks(); return; }
  const j = D.picks.indexOf(null);
  if (j < 0) {
    hint('Your stack is full. Remove one to swap it.');
    bump(E.add3, 1.07); bump($('[data-go="stack"]', E.nav), 1.12);
    return;
  }
  D.picks[j] = id; D.lastPick = j;
  syncPicks();
  if (from && from.closest('.dv-swatches')) flyToSeat(id, from, j);
  else bump($('[data-go="stack"]', E.nav), 1.14);
}
function clone(src, box) {
  const c = document.createElement('img'); c.className = 'dv-clone'; c.alt = ''; c.src = src;
  c.style.width = box.width + 'px'; c.style.height = box.height + 'px';
  body.appendChild(c);
  gsap.set(c, { x: box.left, y: box.top, transformOrigin: '50% 50%' });
  return c;
}
function flyToSeat(id, from, j) {
  if (REDUCE) return;
  const seat = E.seats[j], pick = $('.dv-pick', seat), img = $('img', from);
  seat.classList.add('hold');
  const a = img.getBoundingClientRect(), z = { left: 0, top: 0, width: pick.offsetWidth, height: pick.offsetHeight }, s = seat.getBoundingClientRect();
  z.left = s.left; z.top = s.top;
  const c = clone(enc(BOOK.get(id).thumb), z);
  const dx = a.left + a.width / 2 - (z.left + z.width / 2), dy = a.top + a.height / 2 - (z.top + z.height / 2);
  gsap.fromTo(c, { x: z.left + dx, scale: a.width / z.width, rotation: -9 }, { x: z.left, scale: 1, rotation: 0, duration: .66, ease: 'power2.inOut' });
  gsap.fromTo(c, { y: z.top + dy }, { y: z.top, duration: .66, ease: 'back.out(1.25)', onComplete() { seat.classList.remove('hold'); setTimeout(() => c.remove(), 60); } });
}
function addStack() {
  const ids = D.picks.filter(Boolean);
  if (D.adding || !ids.length || ids.length < need()) return;
  D.adding = true;
  ids.slice().reverse().forEach(id => { D.saved = [id, ...D.saved.filter(x => x !== id)]; });
  store.set('library.reading', JSON.stringify(D.saved));
  syncPicks();
  const target = E.list.getBoundingClientRect(), tx = target.left + target.width / 2, ty = target.top + target.height / 2;
  let waiting = 0;
  E.seats.forEach((seat, i) => {
    if (!D.picks[i] || REDUCE) return;
    const box = seat.getBoundingClientRect(), c = clone(enc(BOOK.get(D.picks[i]).thumb), box), delay = .12 + waiting * .13;
    waiting++;
    gsap.to(c, { x: tx - box.width / 2, duration: .8, delay, ease: 'power1.inOut' });
    gsap.to(c, { y: ty - box.height / 2, scale: .12, rotation: i === 1 ? -22 : 18, duration: .8, delay, ease: 'power3.in', onStart() { seat.classList.remove('full'); },
      onComplete() { c.remove(); bump(E.list); syncList(); } });
  });
  clearTimeout(D.doneT);
  D.doneT = setTimeout(() => {
    D.picks = [null, null, null]; D.lastPick = -1;
    syncPicks();                                     // seats and ticks clear; the button still reads "added" for a moment
    D.doneT = setTimeout(() => { D.adding = false; syncPicks(); syncList(); }, REDUCE ? 600 : 1100);
  }, REDUCE ? 400 : 1250);
}

/* ── reading list ──────────────────────────────────────── */
function syncList() {
  const n = D.saved.length;
  E.badge.textContent = n; E.badge.classList.toggle('on', n > 0);
  E.list.setAttribute('aria-label', `Reading list, ${n} ${n === 1 ? 'book' : 'books'}`);
  if (D.panel) renderList();
}
function renderList() {
  E.empty.hidden = D.saved.length > 0;
  E.ul.innerHTML = D.saved.map(id => {
    const b = BOOK.get(id);
    return `<li><img src="${enc(b.thumb)}" alt="" loading="lazy" decoding="async"><div><b>${esc(b.title)}</b><small>${amount(b)} · ${esc(b.author || topicInfo(b.topic).label)}</small></div>` +
      `<span class="acts"><button type="button" data-read="${id}">Read</button><button type="button" data-remove="${id}" aria-label="Remove ${esc(b.title)}">${I.close}</button></span></li>`;
  }).join('');
}
function openPanel() {
  closeMenu();
  D.panel = true; D.returnFocus = document.activeElement; renderList();
  E.panel.inert = false; E.panel.classList.add('open'); E.scrim.classList.add('open'); E.panel.setAttribute('aria-hidden', 'false');
  setTimeout(() => { if (D.panel) $('.dv-close', E.panel).focus({ preventScroll: true }); }, 40);
}
function closePanel(refocus) {
  if (!D.panel) return;
  D.panel = false;
  E.panel.classList.remove('open'); E.scrim.classList.remove('open'); E.panel.setAttribute('aria-hidden', 'true'); E.panel.inert = true;
  if (refocus && D.returnFocus && D.returnFocus.isConnected) D.returnFocus.focus({ preventScroll: true });
  D.returnFocus = null;
}

/* ── topic filter ──────────────────────────────────────── */
function renderMenu() {
  const rows = [['all', 'All topics', '#fdf8ee', ALL.length]].concat((LIB.topics || []).map(t => [t.key, t.label, PALETTE[(BY_TOPIC[t.key] || ['lav'])[0]], t.count]));
  E.menu.innerHTML = rows.map(([k, l, c, n]) => `<button type="button" role="radio" aria-checked="${k === D.topic}" data-topic="${k}" style="--dot:${c}"><i></i>${esc(l)}<small>${n}</small></button>`).join('');
}
function openMenu() { renderMenu(); D.menu = true; E.menu.classList.add('open'); E.topBtn.setAttribute('aria-expanded', 'true'); setTimeout(() => { const on = $('[aria-checked="true"]', E.menu); if (on && D.menu) on.focus({ preventScroll: true }); }, 40); }
function closeMenu(refocus) { if (!D.menu) return; D.menu = false; E.menu.classList.remove('open'); E.topBtn.setAttribute('aria-expanded', 'false'); if (refocus) E.topBtn.focus({ preventScroll: true }); }
function topicLabel() {
  $('span', E.topBtn).textContent = D.topic === 'all' ? 'All topics' : topicInfo(D.topic).chip;
  E.topBtn.classList.toggle('filtered', D.topic !== 'all');
}
function setTopic(k) {
  if (k === D.topic) return;
  const list = k === 'all' ? ALL : ALL.filter(b => b.topic === k);
  if (!list.length) return;
  const prev = current();
  D.topic = k; topicLabel();
  setList(list, list.includes(prev) ? prev : list[0], false);
  toY(0);
  spinIn(.05, 2.6);
}
function setList(list, book, instant = true) {
  D.list = list; D.tones = assignTones(list); D.cur = Math.max(0, list.indexOf(book));
  D.pos = D.target = D.cur; D.lastPos = NaN; D.pending.tone = D.pending.title = false;
  D.slots.forEach(s => { s.key = ''; s.j = NaN; });
  D.keys.shop = D.keys.stack = D.keys.fly = '';
  D.force = true;
  clearTimeout(D.heavyT);
  setTone(D.tones[D.cur], instant); setTitle(current(), instant); setNumber(current(), instant);
  paintFlyer(); refresh(true);
}

/* ── moving between books and sections ─────────────────── */
function show(b, opts = {}) {                        // from search, history or a card
  if (!D.built || !b) return;
  if (!D.list.includes(b)) { D.topic = 'all'; topicLabel(); setList(ALL, b, false); }
  const idx = D.list.indexOf(b);
  if (opts.inside) {
    if (D.sec === 'inside' && current() === b) return;
    pickNow(idx); toY(M.H);
  } else {
    goTo(idx, D.sy > M.H * .6);
    toY(0);
  }
}
function pickNow(idx) {                              // choose a book without moving the carousel on screen
  killSpin();
  if (idx !== D.cur) {
    goTo(idx, true); D.cur = idx; D.pending.tone = D.pending.title = false;
    setTone(D.tones[idx]); setTitle(current(), true); setNumber(current(), true);
  }
  paintFlyer(); setFloats(current()); setInside(current());
}
function fiveMore() {
  const N = D.list.length; if (N <= 5 || D.shuffling) return;
  const near = new Set(featured());
  let i = D.cur, guard = 0;
  while (guard++ < 40 && (near.has(i) || Math.abs(i - D.cur) < 5)) i = Math.floor(Math.random() * N);
  D.shuffling = true;                                // the five leave, five others arrive
  E.shop.classList.remove('in');
  setTimeout(() => {
    D.shuffling = false;
    if (!D.on) return;
    pickNow(i); setShop(true); setStack(true);
    void E.shop.offsetWidth;
    E.shop.classList.add('in');
  }, REDUCE ? 0 : 300);
}
const sectionY = k => k === 'books' ? 0 : k === 'inside' ? M.H : k === 'shop' ? M.shopTop : M.stackTop;
function toY(y) {
  tops();
  y = clamp(y, 0, M.max);
  D.needSnap = false;
  if (REDUCE) { D.anim = null; E.scroll.scrollTop = y; return; }
  const from = E.scroll.scrollTop;
  if (Math.abs(y - from) < 1) { D.anim = null; return; }
  D.anim = { from, to: y, t0: performance.now(), d: clamp(420 + Math.abs(y - from) * .22, 420, 1250) };
}
const stops = () => [0, M.H, 2 * M.H, 3 * M.H, 4 * M.H, M.shopTop, M.stackTop];
function pageStep(dir) {
  tops();
  const y = D.anim ? D.anim.to : E.scroll.scrollTop, pts = stops();
  let next = dir > 0 ? pts.find(p => p > y + 4) : pts.slice().reverse().find(p => p < y - 4);
  if (next === undefined) next = dir > 0 ? M.max : 0;
  if (Math.abs(next - y) > M.H * 1.25) next = y + dir * M.H * .85;          // a tall section on a small screen
  interacted(); toY(next);
}
/* a gentle snap: one flick of the wheel moves on by one screen, tall screens stay free to scroll */
function snapTarget() {
  const y = D.y, H = M.H, dir = Math.sign(y - D.burstFrom) || 1, pts = stops();
  if (y >= M.stackTop - 1) return null;
  let i = 0; while (i < pts.length - 2 && y >= pts[i + 1]) i++;
  let a = pts[i], b = pts[i + 1];
  if (Math.abs(y - a) < 2 || Math.abs(y - b) < 2) return null;
  if (b - a > H * 1.02) { if (y < b - H) return null; a = b - H; }
  const p = (y - a) / (b - a);
  return dir > 0 ? (p > .06 ? b : a) : (p < .94 ? a : b);
}
function snapCheck(now) {
  if (!D.needSnap || D.touching || D.anim || REDUCE) return;
  if (now - D.lastScroll < 150 || now - D.lastInput < 150) return;
  D.needSnap = false;
  tops();
  const to = snapTarget();
  if (to !== null && Math.abs(to - D.y) > 2) toY(to);
}

/* ── sections: reveals, header colour, the switch ──────── */
function reveal(el, on, off) { if (off) el.classList.remove('in'); else if (on) el.classList.add('in'); }
function sections() {
  const sy = D.sy, H = M.H;
  if (!D.shuffling) reveal(E.shop, sy > M.shopTop - H * .5, sy < M.shopTop - H * .94 || sy > M.stackTop + H * .12);
  reveal(E.stack, sy > M.stackTop - H * .5, sy < M.stackTop - H * .94);
  const probe = D.y + 42, mode = probe >= M.stackTop ? 'dark' : probe >= M.shopTop ? 'cream' : 'tone';
  if (mode !== D.mode) { D.mode = mode; root.setAttribute('data-dvs', mode); themeColor(); }
  const m = sy + H * .5, sec = m < H ? 'books' : m < M.shopTop ? 'inside' : m < M.stackTop ? 'shop' : 'stack';
  if (sec !== D.sec) setSection(sec);
}
function setSection(sec) {
  const prev = D.sec; D.sec = sec;
  moveIndicator();
  const back = $('#roundBtn'); if (back) back.setAttribute('aria-label', sec === 'books' ? 'Back to the shelf' : 'Back to the books');
  if (prev && sec !== 'shop') setShop(false);
  if (prev && sec !== 'stack') setStack(false);
  if (sec === 'shop' && prev !== 'stack') centreCards();
  mirror();
}
function moveIndicator() {
  let on = null;
  $$('button', E.nav).forEach(b => {
    const is = b.dataset.go === D.sec; b.classList.toggle('on', is);
    if (is) { b.setAttribute('aria-current', 'true'); on = b; } else b.removeAttribute('aria-current');
  });
  if (on) { E.ind.style.width = on.offsetWidth + 'px'; E.ind.style.transform = `translateX(${on.offsetLeft - E.ind.offsetLeft}px)`; }
}
function mirror() { const a = app(); if (a && a.mirror && D.on) a.mirror(D.sec === 'inside' ? current() : null); }     // the address bar shows the book you are inside

/* ── the frame ─────────────────────────────────────────── */
function frame(now) {
  if (!D.on) return;
  D.raf = requestAnimationFrame(frame);
  const dt = clamp((now - D.lastT) / 1000, .001, .05); D.lastT = now;
  const a = app(); if (a && a.S.view === 'reader') return;          // asleep behind the reader
  tick(now, dt);
}
function tick(now, dt) {
  if (D.anim) {
    const an = D.anim, k = clamp((now - an.t0) / an.d, 0, 1);
    E.scroll.scrollTop = lerp(an.from, an.to, inOut(k));
    if (k >= 1) D.anim = null;
  }
  D.y = E.scroll.scrollTop;
  D.sy += (D.y - D.sy) * (REDUCE ? 1 : damp(15, dt)); if (Math.abs(D.y - D.sy) < .35) D.sy = D.y;
  snapCheck(now);
  if (D.wheelT && now - D.wheelT > 150) { D.wheelT = 0; D.target = Math.round(D.target); }
  if (!D.spin) {
    const diff = D.target - D.pos;
    if (Math.abs(diff) > .0004) D.pos += diff * (REDUCE ? 1 : damp(D.drag ? 26 : 8.5, dt)); else D.pos = D.target;
  }
  const T = D.tilt;
  if (Math.abs(T.tx - T.x) > .01 || Math.abs(T.ty - T.y) > .01) { T.x += (T.tx - T.x) * damp(9, dt); T.y += (T.ty - T.y) * damp(9, dt); D.force = true; }
  if (!D.spin) checkActive(now);
  if (D.sy < M.H * 1.1 && (D.force || D.pos !== D.lastPos)) { renderCar(); D.lastPos = D.pos; D.force = false; }
  stage(now);
  sections();
  if (D.auto && D.sec === 'books' && !D.drag && !D.spin && !D.panel && !D.menu && !(app() && app().S.searchOpen)) {
    D.autoT += dt; if (D.autoT > 2.6) step(1);
  }
  if (D.par.dirty) { D.par.dirty = false; E.floatBox.style.setProperty('--px', D.par.x.toFixed(3)); E.floatBox.style.setProperty('--py', D.par.y.toFixed(3)); }
}

/* ── input ─────────────────────────────────────────────── */
function bind() {
  const sc = E.scroll;
  sc.addEventListener('scroll', () => {
    const y = sc.scrollTop, now = performance.now();
    if (!D.anim) {
      if (now - D.lastScroll > 220) D.burstFrom = D.prevY;
      D.lastScroll = now; D.needSnap = true;
    }
    D.prevY = y;
  }, { passive: true });
  const takeOver = () => { D.anim = null; D.lastInput = performance.now(); };
  sc.addEventListener('wheel', takeOver, { passive: true });
  sc.addEventListener('touchstart', () => { takeOver(); D.touching = true; }, { passive: true });
  ['touchend', 'touchcancel'].forEach(ev => sc.addEventListener(ev, e => { D.touching = e.touches.length > 0; D.lastInput = performance.now(); }, { passive: true }));

  /* the carousel: drag, flick, click, sideways wheel */
  E.car.addEventListener('pointerdown', e => {
    if (e.button > 0 || D.y > M.H * .5) return;
    const slot = e.target.closest('.dv-slot');
    killSpin(); interacted();
    D.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), from: D.target, moved: 0, lx: e.clientX, lt: performance.now(), v: 0, slot: slot && D.slots.find(s => s.el === slot) };
    try { E.car.setPointerCapture(e.pointerId); } catch (_) {}
  });
  E.car.addEventListener('pointermove', e => {
    const g = D.drag;
    if (!g) {
      if (!FINE || e.pointerType !== 'mouse') return;
      const dx = (e.clientX - M.W / 2) / (M.cw / 2), dy = (e.clientY - M.carY) / (M.ch / 2), over = Math.abs(dx) < 1 && Math.abs(dy) < 1;
      D.tilt.ty = over ? dx * 9 : 0; D.tilt.tx = over ? -dy * 6 : 0;
      return;
    }
    if (e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0;
    g.moved = Math.max(g.moved, Math.abs(dx) + Math.abs(e.clientY - g.y0) * .4);
    if (g.moved > 6) { E.car.classList.add('dragging'); D.target = g.from - dx / (M.cw * 1.02); D.tilt.tx = D.tilt.ty = 0; }
    const now = performance.now(), span = (now - g.lt) / 1000;
    if (span > .008) { g.v = g.v * .55 - (e.clientX - g.lx) / (M.cw * 1.02) / span * .45; g.lx = e.clientX; g.lt = now; }
  });
  const release = e => {
    const g = D.drag; if (!g || (e && e.pointerId !== g.id)) return;
    D.drag = null; E.car.classList.remove('dragging'); interacted();
    const tap = e && e.type === 'pointerup' && g.moved < 7 && performance.now() - g.t0 < 600;
    if (tap && g.slot && g.slot.vis) {
      const j = g.slot.j;
      if (mod(j, D.list.length) === D.cur && Math.abs(D.pos - j) < .35) { D.target = Math.round(D.pos); toY(M.H); }
      else D.target = j;
    } else D.target = Math.round(D.target + (e && e.type === 'pointerup' && performance.now() - g.lt < 90 ? clamp(g.v * .16, -3.5, 3.5) : 0));
  };
  E.car.addEventListener('pointerup', release);
  E.car.addEventListener('pointercancel', release);
  E.car.addEventListener('pointerleave', () => { D.tilt.tx = D.tilt.ty = 0; });
  E.car.addEventListener('wheel', e => {
    const side = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
    if (!side || (!e.shiftKey && Math.abs(e.deltaX) <= Math.abs(e.deltaY))) return;       // up and down still scrolls the page
    e.preventDefault(); killSpin(); interacted();
    D.target += side * (e.deltaMode === 1 ? 16 : 1) / (M.cw * 1.4); D.wheelT = performance.now();
  }, { passive: false });
  if (FINE && !REDUCE) E.dv.addEventListener('pointermove', e => { D.par.x = e.clientX / M.W - .5; D.par.y = e.clientY / M.H - .5; D.par.dirty = true; }, { passive: true });

  E.go.addEventListener('click', () => toY(M.H));
  E.auto.addEventListener('click', () => { D.auto = !D.auto; D.autoT = 2; E.auto.setAttribute('aria-pressed', D.auto); });
  E.steps.forEach(b => b.addEventListener('click', () => toY(M.H * (1 + +b.dataset.step))));
  const readCurrent = () => app() && app().readNow(current(), 0);
  E.readBtn.addEventListener('click', readCurrent);
  E.read.addEventListener('click', readCurrent);
  E.cards.addEventListener('click', e => {
    const add = e.target.closest('[data-pick]'); if (add) { togglePick(add.dataset.pick, add); return; }
    const open = e.target.closest('[data-open]'); if (open) { pickNow(D.list.indexOf(BOOK.get(open.dataset.open))); toY(M.H); }
  });
  E.swatches.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) togglePick(b.dataset.pick, b); });
  E.seats.forEach((seat, i) => $('.dv-x', seat).addEventListener('click', () => { if (D.picks[i]) togglePick(D.picks[i]); }));
  E.add3.addEventListener('click', addStack);
  E.more.addEventListener('click', fiveMore);

  E.nav.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    tops();
    if (b.dataset.go === 'books' && D.sy > M.shopTop - M.H * .5) spinIn(.75, 3);     // back to the start: the row spins in again
    toY(sectionY(b.dataset.go));
  });
  E.search.addEventListener('click', () => app() && app().openSearch());
  E.list.addEventListener('click', () => D.panel ? closePanel(true) : openPanel());
  E.scrim.addEventListener('click', () => closePanel(true));
  E.panel.addEventListener('click', e => {
    if (e.target.closest('.dv-close')) { closePanel(true); return; }
    const r = e.target.closest('[data-read]');
    if (r) { const b = BOOK.get(r.dataset.read); closePanel(false); if (app()) app().readNow(b, 0); return; }
    const x = e.target.closest('[data-remove]');
    if (x) { D.saved = D.saved.filter(id => id !== x.dataset.remove); store.set('library.reading', JSON.stringify(D.saved)); syncList(); const n = $('[data-remove]', E.ul) || $('.dv-close', E.panel); n.focus({ preventScroll: true }); }
  });
  E.topBtn.addEventListener('click', () => D.menu ? closeMenu() : openMenu());
  E.menu.addEventListener('click', e => { const b = e.target.closest('[data-topic]'); if (b) { closeMenu(true); setTopic(b.dataset.topic); } });
  E.menu.addEventListener('keydown', e => {
    const items = Array.from(E.menu.children), i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); items[mod(i + (e.key === 'ArrowDown' ? 1 : -1), items.length)].focus(); }
    else if (e.key === 'Tab') closeMenu();
  });
  document.addEventListener('pointerdown', e => { if (D.menu && !E.topics.contains(e.target)) closeMenu(); }, true);

  addEventListener('keydown', e => {
    if (!D.on || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    const a = app(); if (!a || a.S.view !== 'shelf' || a.S.searchOpen) return;
    const t = e.target, k = e.key;
    if (t.closest && t.closest('input, textarea, select, .tpanel')) return;
    if (k === 'Escape') {
      if (D.panel) closePanel(true); else if (D.menu) closeMenu(true); else if (D.y > 4) toY(0); else return;
      e.preventDefault(); return;
    }
    if (D.panel || D.menu) return;
    const onControl = !!(t.closest && t.closest('button, a, [role="radio"]'));
    const side = k === 'ArrowRight' || k === 'd' ? 1 : k === 'ArrowLeft' || k === 'a' ? -1 : 0;
    if (side) {                                      // previous / next book, on the first two screens
      if (D.sec !== 'books' && D.sec !== 'inside') return;
      e.preventDefault(); step(side); if (D.sec === 'inside') D.pos = D.target;
    }
    else if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !onControl && !e.shiftKey)) { e.preventDefault(); pageStep(1); }
    else if (k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && !onControl && e.shiftKey)) { e.preventDefault(); pageStep(-1); }
    else if (k === 'Home') { e.preventDefault(); toY(0); }
    else if (k === 'End') { e.preventDefault(); tops(); toY(M.max); }
    else if (k === 'l' || k === 'L') openPanel();
    else if (k === 'Enter' && !onControl) { e.preventDefault(); if (D.sec === 'books') toY(M.H); else if (D.sec === 'inside') readCurrent(); }
  });

  let rz = 0;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (!D.on) return;
      const y = E.scroll.scrollTop, H = M.H, shop = M.shopTop;
      measure();
      E.scroll.scrollTop = y <= shop ? y / H * M.H : M.shopTop + (y - shop);
      D.sy = D.y = E.scroll.scrollTop; D.anim = null; D.needSnap = false;
      refit(); D.keys.orbit = ''; D.force = true; D.sideO = D.numY = -1; moveIndicator(); centreCards();
    }, 120);
  });
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (D.on) tops(); }); ro.observe(E.shop); ro.observe(E.stack); }
  document.addEventListener('libview', e => {
    const reading = e.detail === 'reader';
    E.dv.inert = reading;
    if (reading) { closePanel(false); closeMenu(); }
    else if (D.on) { D.force = true; D.lastT = performance.now(); }
  });
}
function refit() {                                    // after a resize, or once the display face has arrived
  const el = E.name.querySelector('.dv-name-l:not(.out)'); if (el) fitTitle(el);
  fitNames('.dv-card h3', 11); fitNames('.dv-sw-n', 7);
}

/* ── on and off ────────────────────────────────────────── */
function activate(opts = {}) {
  if (!D.built) build();
  D.on = true;
  if (opts.from && opts.from !== 'dynamic') store.set('library.classic', opts.from);
  const book = opts.book || current() || ALL[0];
  measure();
  const keep = D.topic !== 'all' && D.list.includes(book);
  if (!keep) D.topic = 'all';
  topicLabel();
  Object.assign(D, { sec: '', mode: '', step: -1, away: null, flying: null, orbit: false, deep: -1, ringsO: '', sideO: -1, numY: -1, cta: null, anim: null, drag: null, needSnap: false });
  D.keys = { fly: '', floats: '', inside: '', orbit: '', shop: '', stack: '' };
  E.orbit.classList.remove('on');
  setList(keep ? D.list : ALL, book, true);
  const y = opts.inside ? M.H : 0;
  E.scroll.scrollTop = y; D.y = D.sy = D.prevY = D.burstFrom = y;
  E.shop.classList.remove('in'); E.stack.classList.remove('in');
  const a = app(); E.dv.inert = !!(a && a.S.view === 'reader');
  syncPicks(); syncList();
  const delay = opts.delay || 0;
  E.dv.classList.remove('intro'); E.nav.classList.remove('intro'); void E.dv.offsetWidth;
  if (opts.intro && !opts.inside && !REDUCE) {
    E.dv.style.setProperty('--d0', delay + 's'); E.nav.style.setProperty('--d0', delay + 's');
    E.dv.classList.add('intro'); E.nav.classList.add('intro');
    spinIn(delay);
  }
  E.nav.classList.add('snap');
  const now = performance.now(); D.lastT = now;
  tick(now, .016);                                   // paint a first frame right away (the theme reveal photographs it)
  renderCar();
  requestAnimationFrame(() => requestAnimationFrame(() => E.nav.classList.remove('snap')));
  cancelAnimationFrame(D.raf); D.raf = requestAnimationFrame(frame);
  if (document.fonts && document.fonts.load) document.fonts.load("900 40px 'Library Display'").then(() => { if (D.on) { refit(); moveIndicator(); } }, () => {});
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (D.on) moveIndicator(); });
}
function deactivate() {
  if (!D.on) return;
  D.on = false;
  cancelAnimationFrame(D.raf); D.raf = 0;
  if (D.spin) { D.spin.kill(); D.spin = null; }
  D.anim = null; D.drag = null; clearTimeout(D.heavyT); clearTimeout(D.doneT);
  if (D.adding) { D.adding = false; D.picks = [null, null, null]; }
  closePanel(false); closeMenu();
  $$('.dv-clone').forEach(c => { gsap.killTweensOf(c); c.remove(); });
  E.ripples.textContent = '';
  E.dv.classList.remove('intro'); E.nav.classList.remove('intro');
  root.removeAttribute('data-dvs');
  const back = $('#roundBtn'); if (back) back.setAttribute('aria-label', 'Search the library');
}
function back() {                                    // the round button: one level up, and from the top back to the shelf
  if (D.panel) { closePanel(true); return; }
  if (D.menu) { closeMenu(true); return; }
  if (E.scroll.scrollTop > 4) { toY(0); return; }
  const was = store.get('library.classic');
  const to = was && was !== 'dynamic' ? was : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  if (window.LibraryTheme) window.LibraryTheme.set(to, { from: $('#roundBtn') });
}

window.LibraryDynamic = { activate, deactivate, show, back, sync: mirror, current: () => D.built ? current() : null, isOn: () => D.on };
})();
