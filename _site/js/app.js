/* ───────────────────────────────────────────────────────────
   The Library · engine
   shelf (infinite 3D ring) · bookcase · detail (shared-element flight) · reader · search
   ─────────────────────────────────────────────────────────── */
(function () {
'use strict';

const LIB = window.LIBRARY, ALL = LIB.books;
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = matchMedia('(pointer: fine)').matches;
const HIDPI = (window.devicePixelRatio || 1) >= 1.5;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mod = (n, m) => ((n % m) + m) % m;
const ease = t => t * t * (3 - 2 * t);                 // smoothstep
const HALF = Math.PI / 2, DEG = 180 / Math.PI;
const pad = (n, l = 3) => String(n).padStart(l, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = iso => { const [y, m] = iso.split('-'); return MONTHS[+m - 1] + ' ' + y; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const enc = p => p.split('/').map(encodeURIComponent).join('/');
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const dur = d => REDUCE ? 0.01 : d;
const NO = () => root.getAttribute('data-theme') === 'hacker' ? '#' : '№';          // the monospace terminal face has no numero sign
const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };

// types + topics come from the catalogue (built by tools/build_library.py), so new collections need no code changes
const TYPES = LIB.types || [], TOPICS = LIB.topics || [];
const typeInfo = k => TYPES.find(t => t.key === k) || { key: k, chip: k, label: k };
const topicInfo = k => TOPICS.find(t => t.key === k) || { key: k, chip: k, label: k, dot: '#999' };
const TYPE_LABEL = new Proxy({}, { get: (_, k) => typeInfo(k).label });
const TOPIC_LABEL = new Proxy({}, { get: (_, k) => topicInfo(k).label });
const BOOK = new Map(ALL.map(b => [b.id, b]));
// full-length books (PDF / EPUB) carry a `doc` record; slide posts do not
const isDoc = b => !!(b && b.doc);
const unit = (b, n = b.slides) => isDoc(b) ? (n === 1 ? 'page' : 'pages') : (n === 1 ? 'slide' : 'slides');
const amount = b => `${b.slides.toLocaleString('en')} ${unit(b)}`;
const when = b => isDoc(b) ? (b.doc.edition || 'Added ' + fmtDate(b.date)) : fmtDate(b.date);

/* ── elements ───────────────────────────────────────────── */
const root = document.documentElement, body = document.body;
const E = {
  rail: $('#rail'), stage: $('#stage'), filters: $('#filters'), segType: $('#segType'), segTopic: $('#segTopic'),
  nowWrap: $('#nowWrap'), nowTitle: $('#nowTitle'), nowKicker: $('#nowKicker'), nowDate: $('#nowDate'),
  prev: $('#prevBtn'), next: $('#nextBtn'), round: $('#roundBtn'), metaCount: $('#metaCount'), top: $('.top'), foot: $('.foot'),
  viewBtn: $('#viewBtn'), loader: $('#loader'), ldBar: $('#ldBar'), spot: $('.w-spot'), deco: $$('.back, .plank'),
  caseEl: $('#case'), caseScroll: $('#caseScroll'), bc: $('#bc'), bcBody: $('#bcBody'), bcCount: $('#bcCount'), bcCrown: $('.bc-crown'),
  tip: $('#bcTip'), tipTh: $('#tipTh'), tipTt: $('#tipTt'), tipMm: $('#tipMm'),
  detail: $('#detail'), dSheet: $('#dSheet'), dGrid: $('#dGrid'), dText: $('#dText'), dNo: $('#dNo'), dTopic: $('#dTopic'), dTitle: $('#dTitle'),
  dMeta: $('#dMeta'), dDesc: $('#dDesc'), dRead: $('#dRead'), dIg: $('#dIg'), dIgLabel: $('#dIgLabel'), dBy: $('#dBy'), footSearch: $('#footSearch'), dInside: $('#dInside'), dArt: $('#dArt'),
  dCover: $('#dCover'), dCoverImg: $('#dCover img'), dPrev: $('#dPrev'), dNext: $('#dNext'),
  reader: $('#reader'), rTitle: $('#rTitle'), rCur: $('#rCur'), rTot: $('#rTot'), rClose: $('#rClose'), rStage: $('#rStage'),
  rPage: $('#rPage'), rA: $('#rImgA'), rB: $('#rImgB'), rPrev: $('#rPrev'), rNext: $('#rNext'), rThumbs: $('#rThumbs'),
  search: $('#search'), sVeil: $('#sVeil'), sBox: $('.s-box'), sInput: $('#sInput'), sList: $('#sList'), sCount: $('#sCount'),
  cursor: $('#cursor'), cLabel: $('.c-label'),
};

/* ── state ──────────────────────────────────────────────── */
const S = {
  list: ALL.slice(), N: ALL.length, items: [], vis: [], Tl: [],
  pos: 0, target: 0, lastPos: NaN, lastEnt: NaN, force: true, ent: 0, idle: 0, frame: 0,
  view: 'boot', mode: root.getAttribute('data-view') === 'case' ? 'case' : 'flow', filter: { type: 'all', topic: 'all' },
  vw: 1, vh: 1, H: 400, W: 320, gap: 6, pitch: 60, R: 12,
  nowId: '', book: null, hoverIdx: -1, fly: null,
  tilt: { x: 0, y: 0, tx: 0, ty: 0 },
};
const dirty = () => { S.force = true; };
const bookAtIdx = i => S.list[mod(i, S.N)];
const activeIdx = () => Math.round(S.pos);                       // the shelf is an endless line of integer positions; position p shows list[p mod N]
const activeBook = () => bookAtIdx(activeIdx());
const slotOf = j => S.items.length ? S.items[mod(j, S.items.length)] : null;
const activeItem = () => { const a = activeIdx(), it = slotOf(a); return it && it.idx === a ? it : null; };
const settled = () => Math.abs(S.pos - Math.round(S.pos)) < 0.02 && Math.abs(S.target - S.pos) < 0.02;
function setView(v) {
  S.view = v;
  const sh = $('#shelf'); if (sh) sh.inert = !(v === 'shelf' || v === 'boot');       // nothing behind the book page can take focus
  document.dispatchEvent(new CustomEvent('libview', { detail: v }));
}
let filterBusy = false, modeBusy = false;

/* ── metrics & ring ─────────────────────────────────────── */
const thick = (b, H) => H * (isDoc(b) ? clamp(.13 + .00006 * b.slides, .13, .19) : clamp(.118 + .0042 * b.slides, .12, .19)) * (.95 + (hash(b.id) % 100) / 1000);

function measure() {
  S.vw = innerWidth; S.vh = innerHeight;
  const small = S.vw < 720;
  const topZ = small ? 156 : 194, botZ = small ? 210 : 234;
  let H = clamp(S.vh - topZ - botZ, 200, 590), W = H * .8;
  const maxW = S.vw * (small ? .74 : .5);
  if (W > maxW) { W = maxW; H = W / .8; }
  S.H = Math.round(H); S.W = Math.round(S.H * .8);
  S.gap = Math.max(4, Math.round(S.H * .014));
  const railTop = topZ + Math.max(0, (S.vh - topZ - botZ - S.H) / 2);
  const st = root.style;
  st.setProperty('--H', S.H + 'px'); st.setProperty('--W', S.W + 'px'); st.setProperty('--railTop', railTop + 'px');
  S.pitch = S.H * .158 + S.gap;
  S.R = Math.ceil((S.vw / 2) / (S.H * .12 + S.gap)) + 3;
  S.Tl = S.list.map(b => thick(b, S.H));                         // spine thickness per list index
  S.items.forEach(it => { if (it.b) { it.T = S.Tl[mod(it.idx, S.N)]; it.el.style.setProperty('--T', it.T.toFixed(2) + 'px'); } });
}

const spineInner = b => `<i class="emb"></i><span class="ttl">${esc(b.short)}</span><b class="no">${pad(b.n)}</b><u class="tag">${b.code}</u>`;
const palette = b => { const v = hash(b.id), variant = v % 2; return { variant, emb: (v >> 3) % 7, cls: `sp-${b.topic}-${variant} t-${b.topic} v${variant}` }; };

function itemHTML(b, i) {
  const p = palette(b);
  return `<div class="item ${p.cls}" data-i="${i}"><div class="shadow"></div><div class="book">` +
    `<div class="face spine sp" data-e="${p.emb}" style="--chars:${Math.max(7, b.short.length)}">${spineInner(b)}</div>` +
    `<div class="face cover"><div class="art"><img alt="${esc(b.title)}" decoding="async" draggable="false"><i class="hinge"></i></div></div>` +
    `</div></div>`;
}

/* The shelf is endless, but only a screenful of books is ever visible. Instead of one DOM
   subtree per book (215 x 13 nodes) we keep a small pool of shells and bind each to
   the book at its position as it scrolls in. Style recalculation stays cheap. */
const SHELL = '<div class="item"><div class="shadow"></div><div class="book"><div class="face spine sp"><i class="emb"></i><span class="ttl"></span><b class="no"></b><u class="tag"></u></div><div class="face cover"><div class="art"><img decoding="async" draggable="false" alt=""><i class="hinge"></i></div></div></div></div>';
function buildRing() {
  S.N = S.list.length;
  E.rail.innerHTML = SHELL.repeat(2 * S.R + 8);
  S.items = Array.from(E.rail.children).map(el => {
    const sp = el.querySelector('.spine');
    return { el, idx: NaN, b: null, cls: '', T: 0, book: el.firstChild.nextSibling, shadow: el.firstChild, cover: el.querySelector('.cover'), spine: sp,
      ttl: sp.children[1], no: sp.children[2], tag: sp.children[3], art: el.querySelector('.art'), img: el.querySelector('img'),
      loaded: false, vis: false, hov: 0, f: -1, co: -1, z: 0, lop: -1, isAct: false };
  });
  S.vis = [];
  measure();
  dirty();
}
function bindItem(it, j) {
  const b = S.list[mod(j, S.N)], p = palette(b);
  it.idx = j; it.b = b; it.el.dataset.i = j;
  if (it.cls !== p.cls) { if (it.cls) it.el.classList.remove(...it.cls.split(' ')); it.el.classList.add(...p.cls.split(' ')); it.cls = p.cls; }
  it.spine.dataset.e = p.emb;
  it.spine.style.setProperty('--chars', Math.max(7, b.short.length));
  it.ttl.textContent = b.short; it.no.textContent = pad(b.n); it.tag.textContent = b.code;
  it.T = S.Tl[mod(j, S.N)]; it.el.style.setProperty('--T', it.T.toFixed(2) + 'px');
  it.img.alt = b.title; it.img.classList.remove('on'); it.img.removeAttribute('src'); it.art.style.backgroundImage = '';
  it.cover.style.setProperty('--gl', '0');
  it.loaded = false; it.hov = 0; it.co = -1; it.lop = -1; it.z = 0;
}

function ensureImg(it) {
  if (it.loaded) return;
  it.loaded = true;
  it.art.style.backgroundImage = `url(${it.b.lq})`;
  const im = it.img;
  im.onload = () => im.classList.add('on');
  im.src = enc(HIDPI ? it.b.cover : it.b.thumb);          // 1200px art on retina screens, 640px otherwise
  if (im.complete && im.naturalWidth) im.classList.add('on');
}

/* ── render (called each frame when dirty) ──────────────── */
const AW = new Float32Array(256), AL = new Float32Array(256), AT = new Float32Array(256);

function render() {
  const N = S.N, P = S.items.length; if (!N || !P) return;
  const p = S.pos, k = Math.floor(p), f = p - k, e = ease(f);
  const R = S.R, lo = -R, hi = R + 1, n = hi - lo + 1, i0 = -lo;
  const Wd = S.W, gap = S.gap;

  for (let o = lo; o <= hi; o++) {
    const t = o === 0 ? 1 - e : (o === 1 ? e : 0), th = (1 - t) * HALF;
    AW[o - lo] = Wd * Math.cos(th) + S.Tl[mod(k + o, N)] * Math.sin(th);
    AT[o - lo] = t;
  }
  AL[i0] = 0;
  for (let i = i0 + 1; i < n; i++) AL[i] = AL[i - 1] + AW[i - 1] + gap;
  for (let i = i0 - 1; i >= 0; i--) AL[i] = AL[i + 1] - gap - AW[i];
  const c0 = AL[i0] + AW[i0] / 2, c1 = AL[i0 + 1] + AW[i0 + 1] / 2;
  const focus = c0 + (c1 - c0) * f, cx = S.vw / 2;

  const frame = ++S.frame, ent = S.ent, stag = .05, spread = R * stag, Hh = S.H;
  const act = Math.round(p), zA = act - k;
  const prevVis = S.vis, nextVis = [];

  for (let o = lo; o <= hi; o++) {
    const i = o - lo, w = AW[i], t = AT[i], j = k + o;
    const xc = cx + AL[i] + w / 2 - focus;
    if (xc + w / 2 < -60 || xc - w / 2 > S.vw + 60) continue;
    const d = Math.abs(o - f);
    const local = ent >= 1 ? 1 : clamp(ent * (1 + spread) - d * stag, 0, 1);
    if (local <= 0) continue;
    const it = S.items[mod(j, P)];
    if (it.idx !== j) bindItem(it, j);
    it.f = frame; nextVis.push(it);
    const isAct = (j === act);
    if (isAct !== it.isAct) { it.isAct = isAct; it.el.classList.toggle('is-active', isAct); if (!isAct) it.cover.style.setProperty('--gl', '0'); }
    const z = 600 - Math.abs(o - zA) * 4;                      // changes only when the active book changes
    if (z !== it.z) { it.z = z; it.el.style.zIndex = z; }
    if (!it.vis) { it.vis = true; it.el.classList.add('vis'); }
    if (d < 4.5) ensureImg(it);

    const th = (1 - t) * HALF, sinT = Math.sin(th);
    const lift = -Math.sin(t * Math.PI) * Hh * .016 - it.hov * Hh * .028;
    const y = (1 - ease(local)) * Hh * .34;
    it.el.style.transform = `translate3d(${(xc - Wd / 2).toFixed(2)}px,${y.toFixed(2)}px,0)`;
    if (local !== it.lop) { it.lop = local; const v = local < 1 ? local.toFixed(3) : ''; it.spine.style.opacity = v; it.cover.style.opacity = v; }
    const tl = it.isAct ? S.tilt : null, tr = tl ? ` rotateX(${(tl.x * t).toFixed(3)}deg)` : '', ty = tl ? tl.y * t : 0;
    it.book.style.transform = `translate3d(0,${lift.toFixed(2)}px,${(-(Wd / 2) * sinT).toFixed(2)}px)${tr} rotateY(${(th * DEG + ty).toFixed(3)}deg) scale(${(1 + .055 * t).toFixed(4)})`;
    const co = clamp((t - .035) / .22, 0, 1);
    if (co !== it.co) { it.co = co; it.art.style.opacity = co; }
    it.shadow.style.transform = `translate3d(0,0,-1px) scaleX(${(w / Wd).toFixed(3)})`;
    it.shadow.style.opacity = ((.5 + .45 * t) * local).toFixed(3);
  }
  for (let j = 0; j < prevVis.length; j++) {
    const it = prevVis[j];
    if (it.f !== frame) { it.vis = false; it.el.classList.remove('vis'); if (it.isAct) { it.isAct = false; it.el.classList.remove('is-active'); } }
  }
  S.vis = nextVis;
}

/* ── frame loop ─────────────────────────────────────────── */
let lastT = performance.now();
const drag = { on: false, id: null, x0: 0, t0: 0, tgt0: 0, moved: 0, lx: 0, lt: 0, vel: 0, item: null, y0: 0 };

function tick(now) {
  const dt = clamp((now - lastT) / 1000, 0.001, 0.05); lastT = now;
  if ((S.mode === 'flow' && (S.view === 'shelf' || S.view === 'boot')) || S.force) {
    S.idle += dt;
    if (!drag.on && S.idle > .13 && S.view === 'shelf') {
      const r = Math.round(S.target);
      if (Math.abs(S.target - r) > .0008) S.target = r;
    }
    const k = drag.on ? 24 : 6.4;
    const diff = S.target - S.pos;
    if (Math.abs(diff) > 0.00005) { S.pos += diff * (1 - Math.exp(-dt * k)); if (Math.abs(S.target - S.pos) < 0.00008) S.pos = S.target; }
    // hover lift
    if (S.view === 'shelf' && S.mode === 'flow' && FINE) {
      for (let j = 0; j < S.vis.length; j++) {
        const it = S.vis[j], goal = (it.idx === S.hoverIdx && !drag.on && it.idx !== Math.round(S.pos) && Math.abs(S.target - S.pos) < .6) ? 1 : 0;
        if (it.hov !== goal) { it.hov += (goal - it.hov) * (1 - Math.exp(-dt * 14)); if (Math.abs(goal - it.hov) < .002) it.hov = goal; S.force = true; }
      }
    }
    const T = S.tilt, kt = 1 - Math.exp(-dt * 9);
    if (Math.abs(T.tx - T.x) > .002 || Math.abs(T.ty - T.y) > .002) { T.x += (T.tx - T.x) * kt; T.y += (T.ty - T.y) * kt; S.force = true; }
    if (S.pos !== S.lastPos || S.ent !== S.lastEnt || S.force) {
      render(); S.lastPos = S.pos; S.lastEnt = S.ent; S.force = false;
      const a = activeIdx(); if (a !== S.lastAct) { S.lastAct = a; onActiveChange(); }
    }
  }
  cursorTick(dt);
  requestAnimationFrame(tick);
}

/* ── caption under the shelf ───────────────────────────── */
let nowTimer = 0;
function fillNow(b) {
  E.nowTitle.textContent = b.title;
  E.nowKicker.textContent = `${NO()} ${pad(b.n)}  ·  ${TOPIC_LABEL[b.topic]}  ·  ${TYPE_LABEL[b.type]}`;
  E.nowDate.textContent = `${when(b)}  ·  ${amount(b)}`;
}
function onActiveChange() {
  if (S.view !== 'shelf' && S.view !== 'boot') return;
  const b = activeBook(); if (!b || b.id === S.nowId) return;
  S.nowId = b.id;
  clearTimeout(nowTimer);
  nowTimer = setTimeout(() => {
    const els = [E.nowTitle, E.nowKicker, E.nowDate];
    gsap.timeline({ overwrite: true })
      .to(els, { y: -10, opacity: 0, duration: dur(.16), ease: 'power2.in', stagger: .02, overwrite: true })
      .add(() => fillNow(bookAtIdx(activeIdx())))
      .fromTo(els, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: dur(.7), ease: 'expo.out', stagger: .05 });
  }, 70);
}

/* ── navigation helpers ─────────────────────────────────── */
function step(d) { S.idle = 0; S.target = Math.round(S.target) + d; }
function goTo(listIdx, instant) {                 // a list index -> the nearest position that shows it
  const N = S.N, base = Math.round(S.target);
  let d = mod(listIdx - base, N); if (d > N / 2) d -= N;
  goToRing(base + d, instant);
}
function goToRing(r, instant) {                    // an exact position on the endless line
  if (instant) { S.pos = S.target = r; S.idle = 0; dirty(); return; }
  const delta = r - Math.round(S.target);
  if (Math.abs(delta) > 14) S.pos = r - Math.sign(delta) * 14;     // long jumps skip the middle of the journey
  S.target = r; S.idle = 0;
}

/* ── filters ────────────────────────────────────────────── */
function buildFilters() {
  const typeCount = t => t === 'all' ? ALL.length : ALL.filter(b => b.type === t).length;
  const types = [['all', 'All']].concat(TYPES.map(t => [t.key, t.chip]));
  E.segType.innerHTML = '<i class="ind"></i>' + types.map(([k, l]) => `<button data-k="${k}" data-cursor="btn"${k === 'all' ? ' class="on"' : ''}>${l}<sup>${typeCount(k)}</sup></button>`).join('');
  const topics = TOPICS.filter(t => t.count >= (t.key === 'career' || t.key === 'other' ? 8 : 4));
  E.segTopic.innerHTML = [['all', 'Every topic', '#8f8c84']].concat(topics.map(t => [t.key, t.chip, t.dot]))
    .map(([k, l, c]) => `<button data-k="${k}" data-cursor="btn" style="--dot:${c}"${k === 'all' ? ' class="on"' : ''}><i></i>${l}</button>`).join('');
  E.segType.addEventListener('click', e => { const b = e.target.closest('button'); if (b) applyFilter({ type: b.dataset.k }); });
  E.segTopic.addEventListener('click', e => { const b = e.target.closest('button'); if (b) applyFilter({ topic: b.dataset.k }); });
}
function moveInd() {
  const on = $('button.on', E.segType), ind = $('.ind', E.segType); if (!on || !ind) return;
  ind.style.width = on.offsetWidth + 'px'; ind.style.transform = `translateX(${on.offsetLeft}px)`;
}
function updateFilterUI() {
  $$('button', E.segType).forEach(b => b.classList.toggle('on', b.dataset.k === S.filter.type));
  $$('button', E.segTopic).forEach(b => b.classList.toggle('on', b.dataset.k === S.filter.topic));
  moveInd();
}
function filtered(f) {
  return ALL.filter(b => (f.type === 'all' || b.type === f.type) && (f.topic === 'all' || b.topic === f.topic));
}
function applyFilter(patch, focusBook) {
  if (filterBusy || modeBusy) return;
  const next = Object.assign({}, S.filter, patch);
  if (next.type === S.filter.type && next.topic === S.filter.topic && !focusBook) return;
  let list = filtered(next);
  if (!list.length) { next.topic = 'all'; list = filtered(next); }
  if (!list.length) return;
  S.filter = next; updateFilterUI();
  const cur = focusBook || (S.view === 'shelf' ? activeBook() : S.book || activeBook());
  filterBusy = true;
  if (S.mode === 'case') { applyFilterCase(list, cur, focusBook); return; }
  gsap.killTweensOf(S, 'ent');
  gsap.to(S, {
    ent: 0, duration: dur(.32), ease: 'power2.in', onUpdate: dirty,
    onComplete() {
      S.list = list; buildRing();
      const idx = Math.max(0, list.indexOf(cur));
      S.pos = S.target = idx; S.lastAct = -1; S.nowId = '';
      const a = bookAtIdx(idx); fillNow(a); S.nowId = a.id;
      countTo(list.length);
      gsap.to(S, { ent: 1, duration: dur(1.4), ease: 'power3.out', onUpdate: dirty, onComplete() { filterBusy = false; flushRoute(); later(refreshCase, 300); } });
    },
  });
}
let countObj = { n: ALL.length };
function countTo(n) { gsap.to(countObj, { n, duration: dur(.9), ease: 'power3.out', snap: { n: 1 }, onUpdate() { E.metaCount.textContent = countObj.n; } }); }

/* a book that is not part of the filtered shelf (deep link, search) → show everything first */
function ensureInList(b) {
  if (S.list.indexOf(b) >= 0) return;
  S.filter = { type: 'all', topic: 'all' }; updateFilterUI();
  S.list = ALL.slice(); buildRing(); S.lastAct = -1;
  countObj.n = ALL.length; E.metaCount.textContent = ALL.length;
  if (S.mode === 'case') buildCase();
}

/* ── input : wheel · drag · keys ────────────────────────── */
E.stage.addEventListener('wheel', e => {
  if (S.view !== 'shelf' || S.mode !== 'flow' || filterBusy || modeBusy) return;
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? S.vh : 1);
  const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
  S.target += d / (S.pitch * 1.7); S.idle = 0;
}, { passive: false });

E.stage.addEventListener('pointerdown', e => {
  if (S.view !== 'shelf' || S.mode !== 'flow' || filterBusy || modeBusy || e.button > 0) return;
  drag.on = true; drag.id = e.pointerId; drag.x0 = drag.lx = e.clientX; drag.y0 = e.clientY;
  drag.t0 = drag.lt = performance.now(); drag.tgt0 = S.target; drag.moved = 0; drag.vel = 0;
  drag.item = e.target.closest('.item');
  drag.onCover = !!e.target.closest('.item.is-active .cover');
  S.idle = 0;
  try { E.stage.setPointerCapture(e.pointerId); } catch (_) {}
});
E.stage.addEventListener('pointermove', e => {
  if (!drag.on || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x0;
  drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(e.clientY - drag.y0) * .5);
  if (drag.moved > 6) { S.target = drag.tgt0 - dx / S.pitch; S.idle = 0; cursorMode('drag'); }
  const now = performance.now(), dtm = (now - drag.lt) / 1000;
  if (dtm > .008) { const v = -(e.clientX - drag.lx) / S.pitch / dtm; drag.vel = drag.vel * .6 + v * .4; drag.lx = e.clientX; drag.lt = now; }
});
function endDrag(e) {
  if (!drag.on || (e && e.pointerId !== drag.id)) return;
  drag.on = false;
  try { E.stage.releasePointerCapture(drag.id); } catch (_) {}
  const wasTap = drag.moved < 7 && performance.now() - drag.t0 < 600;
  if (wasTap && drag.item) {
    const idx = +drag.item.dataset.i, a = activeIdx();
    if (idx === a && settled() && drag.onCover) openDetail(bookAtIdx(a));
    else if (idx !== a) goToRing(idx);
    else if (idx === a && drag.onCover) openDetail(bookAtIdx(a));
  } else if (drag.moved >= 7) {
    S.target += clamp(drag.vel * .26, -7, 7); S.idle = 0;
  }
  cursorMode('');
}
E.stage.addEventListener('pointerup', endDrag);
E.stage.addEventListener('pointercancel', endDrag);
E.stage.addEventListener('pointerleave', () => { S.hoverIdx = -1; });
E.stage.addEventListener('pointermove', e => {
  if (drag.on) return;
  const it = e.target.closest('.item'); S.hoverIdx = it ? +it.dataset.i : -1;
});

E.prev.addEventListener('click', () => S.view === 'shelf' && S.mode === 'flow' && step(-1));
E.next.addEventListener('click', () => S.view === 'shelf' && S.mode === 'flow' && step(1));

addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) { if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); toggleSearch(); } return; }
  if (S.searchOpen) return;
  const k = e.key;
  const onCtl = !!(e.target.closest && e.target.closest('button, a, input, textarea, select, [role="radio"]'));   // let real controls keep Enter / Space
  if (S.view === 'shelf') {
    if ((k === 'b' || k === 'B') && !e.target.closest('input, textarea')) { e.preventDefault(); setMode(S.mode === 'flow' ? 'case' : 'flow'); return; }
    if (k === '/') { e.preventDefault(); openSearch(); return; }
    if (S.mode === 'flow') {
      if (k === 'ArrowRight' || k === 'd') step(1);
      else if (k === 'ArrowLeft' || k === 'a') step(-1);
      else if (k === 'Home') goTo(0);
      else if ((k === 'Enter' || k === ' ') && !onCtl) { e.preventDefault(); if (settled()) openDetail(activeBook()); }
    }
  } else if (S.view === 'detail') {
    if (k === 'Escape' || (k === 'Backspace' && !onCtl)) { e.preventDefault(); closeDetail(); }
    else if (k === 'ArrowRight') stepDetail(1);
    else if (k === 'ArrowLeft') stepDetail(-1);
    else if (k === 'Enter' && !onCtl) openReader(S.book, 0);
  } else if (S.view === 'reader') {
    if (k === 'Escape') closeReader();
    else if (k === 'ArrowRight' || (k === ' ' && !onCtl) || k === 'PageDown') { e.preventDefault(); readerStep(1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') readerStep(-1);
    else if (k === 'Home') readerGo(0);
    else if (k === 'End') readerGo(S.book.slides - 1);
  }
});

/* ── cursor ─────────────────────────────────────────────── */
let cx = -100, cy = -100, tx = -100, ty = -100, cMode = '', cHover = '', glare = null;
function cursorMode(m) { cMode = m; applyCursor(); }
function applyCursor() {
  const m = cMode || cHover;
  E.cursor.classList.toggle('is-open', m === 'open');
  E.cursor.classList.toggle('is-btn', m === 'btn');
  E.cursor.classList.toggle('is-drag', m === 'drag');
}
function cursorTick(dt) {
  if (!FINE) return;
  cursorProbe(dt);
  const k = 1 - Math.exp(-dt * 22);
  cx += (tx - cx) * k; cy += (ty - cy) * k;
  E.cursor.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`;
}
function hoverOf(t) {
  let h = '', label = 'Open';
  if (t && t.closest) {
    if (t.closest('.item.is-active .cover') && S.view === 'shelf' && S.mode === 'flow') h = 'open';
    else if (t.closest('#dCover') && S.view === 'detail') { h = 'open'; label = 'Read'; }
    else if (t.closest('[data-cursor="btn"], button, a, input, li')) h = 'btn';
  }
  if (h !== cHover || label !== E.cLabel.textContent) { cHover = h; E.cLabel.textContent = label; applyCursor(); }
}
let probeT = 0;
function cursorProbe(dt) {
  probeT += dt; if (probeT < .1 || !E.cursor.classList.contains('on')) return; probeT = 0;
  if (!drag.on) hoverOf(document.elementFromPoint(tx, ty));
}
if (FINE) {
  body.classList.add('has-cursor');
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    tx = e.clientX; ty = e.clientY;
    if (!E.cursor.classList.contains('on')) { cx = tx; cy = ty; E.cursor.classList.add('on'); }
    hoverOf(e.target);
    const cv = S.view === 'shelf' && S.mode === 'flow' && !drag.on && e.target.closest && e.target.closest('.item.is-active .cover');
    if (cv) {
      const r = cv.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      S.tilt.ty = (px - .5) * 9; S.tilt.tx = -(py - .5) * 7;
      cv.style.setProperty('--gx', (px * 100).toFixed(1) + '%'); cv.style.setProperty('--gy', (py * 100).toFixed(1) + '%'); cv.style.setProperty('--gl', '1');
      glare = cv;
    } else {
      S.tilt.tx = 0; S.tilt.ty = 0;
      if (glare) { glare.style.setProperty('--gl', '0'); glare = null; }
    }
  }, { passive: true });
  document.addEventListener('pointerleave', () => E.cursor.classList.remove('on'));
  document.addEventListener('pointerenter', () => E.cursor.classList.add('on'));
}

/* ── history : the URL hash always mirrors the view ─────────
   #/            shelf            (depth 0)
   #/<id>        book page        (depth 1)
   #/<id>/read/n reader, slide n  (depth 2)
   We push one entry per level, so Back / Esc / the round button all
   unwind the same way; paging inside a level only replaces the entry. */
const NAV = { busy: false, t: 0, pending: undefined };
const hashOf = (b, read, slide) => '#/' + (b ? b.id + (read ? '/read' + (slide ? '/' + slide : '') : '') : '');
const hdepth = () => (history.state && history.state.lib ? history.state.d | 0 : -1);
function hpush(h, d) { try { history.pushState({ lib: 1, d }, '', h); } catch (_) {} }
function hrepl(h, d) { try { history.replaceState({ lib: 1, d }, '', h); } catch (_) {} }
function parseHash() {
  const m = location.hash.match(/^#\/([\w-]+)(?:\/(read)(?:\/(\d+))?)?$/);
  if (!m) return null;
  const b = BOOK.get(m[1]); return b ? { b, read: !!m[2], slide: +(m[3] || 0) } : null;
}
function rebuildStack(t) {        // landing on / typing a deep link: give Back something sensible to unwind
  try {
    if (!t) { history.replaceState({ lib: 1, d: 0 }, ''); return; }
    history.replaceState({ lib: 1, d: 0 }, '', '#/');
    history.pushState({ lib: 1, d: 1 }, '', hashOf(t.b));
    if (t.read) history.pushState({ lib: 1, d: 2 }, '', hashOf(t.b, true, t.slide));
  } catch (_) {}
}
function histBack(fallback) {     // go up one level through history; run `fallback` if that is not possible
  if (hdepth() >= 1) {
    if (NAV.busy) return;
    NAV.busy = true; clearTimeout(NAV.t);
    NAV.t = setTimeout(() => { if (NAV.busy) { NAV.busy = false; fallback(); } }, 800);
    try { history.back(); return; } catch (_) { NAV.busy = false; clearTimeout(NAV.t); }
  }
  fallback();
}
addEventListener('popstate', () => {
  NAV.busy = false; clearTimeout(NAV.t);
  const t = parseHash(), want = t ? (t.read ? 2 : 1) : 0;
  if (hdepth() !== want) rebuildStack(t);
  applyRoute(t);
});
function flushRoute() { if (NAV.pending !== undefined && S.view === 'shelf' && !modeBusy && !filterBusy) { const t = NAV.pending; NAV.pending = undefined; applyRoute(t); } }

/* make the UI match a route (never touches history) */
function applyRoute(t, initial) {
  const v = S.view;
  if (v === 'closing' || v === 'boot' || modeBusy || filterBusy) { NAV.pending = t || null; return; }
  if (!t) {
    if (v === 'reader') doCloseReader();
    if (S.view === 'detail') doCloseDetail();
    return;
  }
  if (v === 'shelf') {
    ensureInList(t.b);
    goTo(S.list.indexOf(t.b), true);
    fillNow(t.b); S.nowId = t.b.id;
    const open = () => doOpenDetail(t.b, { instant: true, then: t.read ? () => doOpenReader(t.b, t.slide, true) : null });
    initial ? setTimeout(open, 80) : open();
  } else if (v === 'detail') {
    if (t.b !== S.book) swapDetail(t.b);
    if (t.read) doOpenReader(t.b, t.slide, false);
  } else if (v === 'reader') {
    if (t.b !== S.book) { doCloseReader(true); swapDetail(t.b); if (t.read) setTimeout(() => doOpenReader(t.b, t.slide, false), 60); }
    else if (t.read) readerGo(t.slide);
    else doCloseReader();
  }
}

/* ── detail ─────────────────────────────────────────────── */
function splitTitle(t) {
  return t.split(/\s+/).map(w => `<span class="w"><span>${esc(w)}</span></span>`).join(' ');
}
function fillDetail(b) {
  S.book = b;
  E.dGrid.scrollTop = 0;
  E.dNo.textContent = NO() + ' ' + pad(b.n);
  E.dTopic.textContent = TOPIC_LABEL[b.topic] + '  /  ' + TYPE_LABEL[b.type];
  E.dTitle.innerHTML = splitTitle(b.title);
  const doc = b.doc;
  E.dMeta.textContent = doc ? `${when(b)}  /  ${amount(b)}  /  ${doc.fmt} · ${doc.mb} MB`
    : `${fmtDate(b.date)}  /  ${amount(b)}  /  ${typeInfo(b.type).label}`;
  E.dDesc.textContent = b.desc;
  E.dBy.innerHTML = !b.author ? '' : doc
    ? `By <em>${esc(b.author)}</em><span class="d-lic">${esc(doc.license)}${doc.site ? ' &nbsp;/&nbsp; from ' + esc(doc.site) : ''}</span>`
    : `Written &amp; designed by <em>${esc(b.author)}</em>${b.handle ? ' &nbsp;/&nbsp; ' + esc(b.handle) : ''}`;
  E.dIg.style.display = b.source ? '' : 'none';
  if (b.source) { E.dIg.href = b.source; E.dIgLabel.textContent = doc ? 'Official download' : 'View on ' + (b.sourceLabel || 'source'); }
  E.dRead.firstChild.textContent = doc && doc.fmt === 'EPUB' ? 'Open the EPUB' : 'Read the book';
  const show = Math.min(b.files.length, 7);
  let h = `<label>Inside — ${amount(b)}</label>`;
  for (let i = 0; i < show; i++) h += `<button data-i="${i}" data-cursor="btn" aria-label="Open ${doc ? 'page ' + doc.pg[i] : 'slide ' + (i + 1)}"><img alt="" loading="lazy" decoding="async"></button>`;
  if (b.slides > show) h += `<span class="more">+${(b.slides - show).toLocaleString('en')}</span>`;
  E.dInside.innerHTML = h;
  $$('button', E.dInside).forEach((btn, i) => {
    const im = btn.firstChild; im.onload = () => im.classList.add('on'); im.src = enc(b.dir + '/' + b.files[i]);
  });
  E.dCover.style.backgroundImage = `url(${b.lq})`;
  E.dCoverImg.classList.add('on');
  E.dCoverImg.src = enc(b.thumb);
  E.dCoverImg.alt = b.title;
  const hi = new Image(); hi.src = enc(b.cover);
  hi.decode().then(() => { if (S.book === b) E.dCoverImg.src = hi.src; }).catch(() => {});
}
function detailEls() {
  return { words: $$('.d-title .w > span', E.dTitle), rv: $$('.rv', E.dText), steps: [E.dPrev, E.dNext] };
}

/* UI entry points (they write history, then animate) */
function openDetail(book, opts = {}) {
  if (S.view !== 'shelf' || modeBusy || filterBusy) return;
  hpush(hashOf(book), 1);
  doOpenDetail(book, opts);
}
function closeDetail() { if (S.view === 'detail') histBack(doCloseDetail); }
function openReader(book, start) {
  if (S.view !== 'detail') return;
  hpush(hashOf(book, true, start), 2);
  doOpenReader(book, start, false);
}
function closeReader() { if (S.view === 'reader') histBack(doCloseReader); }

/* where the lifted cover of the active book sits on the shelf (the page's cover flies back to it) */
function activeCoverRect() {
  const e0 = S.ent; S.ent = 1; render();
  const it = activeItem(), r = it ? it.cover.getBoundingClientRect() : null;
  S.ent = e0; render();
  return r;
}

/* a book travelling between its bookcase slot and the detail page:
   it is pulled off the shelf, turns from spine to cover and lands exactly on the page's cover */
const EASE_POS = gsap.parseEase('expo.inOut'), EASE_ROT = gsap.parseEase('power3.inOut');
function makeFlyer(b, a, z) {
  const H0 = a.height, T0 = Math.max(6, a.width), W0 = H0 * .8;
  const fl = document.createElement('div'); fl.className = 'flyer';
  fl.style.cssText = `--H:${H0}px;--W:${W0}px;--T:${T0}px`;
  fl.innerHTML = itemHTML(b, -1);
  const item = fl.firstElementChild, bk = item.querySelector('.book'), cover = item.querySelector('.cover'), art = item.querySelector('.art'), img = item.querySelector('img');
  item.querySelector('.shadow').remove();
  item.classList.add('vis');
  art.style.opacity = 1; art.style.backgroundImage = `url(${b.lq})`;
  img.onload = () => img.classList.add('on'); img.src = enc(b.thumb); if (img.complete && img.naturalWidth) img.classList.add('on');
  document.body.appendChild(fl);

  const cx0 = a.left + a.width / 2, by0 = a.bottom, POP = Math.min(110, H0 * .4);
  let S1 = z.height / H0, cx1 = z.left + z.width / 2, by1 = z.bottom;
  const put = (u, pop) => {
    const e = EASE_POS(u), r = EASE_ROT(u), th = (1 - r) * HALF, s = 1 + (S1 - 1) * e;
    const x = cx0 + (cx1 - cx0) * e, yb = by0 + (by1 - by0) * e, zp = pop === false ? 0 : Math.sin(Math.PI * u) * POP;
    item.style.transform = `translate3d(${(x - W0 / 2).toFixed(2)}px,${(yb - H0).toFixed(2)}px,0)`;
    bk.style.transform = `translate3d(0,0,${(-(W0 / 2) * Math.sin(th) + zp).toFixed(2)}px) rotateY(${(th * DEG).toFixed(3)}deg) scale(${s.toFixed(4)})`;
  };
  for (let k = 0; k < 2; k++) {                // calibrate: the projected cover must land on the page's cover
    put(1, false);
    const r = cover.getBoundingClientRect();
    if (r.width > 4) {
      S1 *= z.width / r.width; put(1, false);
      const r2 = cover.getBoundingClientRect();
      cx1 += (z.left + z.width / 2) - (r2.left + r2.width / 2); by1 += (z.top + z.height / 2) - (r2.top + r2.height / 2);
    }
  }
  put(0);
  const fly = { el: fl, put, destroy() { fl.remove(); if (S.fly === fly) S.fly = null; } };
  return fly;
}
function flyTween(fly, from, to, d) {
  const o = { u: from };
  return gsap.to(o, { u: to, duration: d, ease: 'none', onUpdate: () => fly.put(o.u) });
}

function doOpenDetail(book, opts = {}) {
  if (S.view !== 'shelf' && S.view !== 'boot') return;
  const instant = opts.instant || REDUCE;
  setView('detail'); body.classList.add('is-inside');
  S.focusBack = document.activeElement;
  hideTip();
  fillDetail(book);
  E.detail.classList.add('is-open'); E.detail.setAttribute('aria-hidden', 'false');
  try { E.detail.focus({ preventScroll: true }); } catch (_) {}
  gsap.killTweensOf([E.dCover, E.dSheet]);
  gsap.set(E.dCover, { x: 0, y: 0, scale: 1, opacity: 1 });
  const to = E.dCover.getBoundingClientRect();
  const caseMode = S.mode === 'case';
  const it = activeItem();
  let from = null, fly = null;
  if (!instant) {
    if (caseMode && opts.spine && opts.spine.el.isConnected) {
      releaseOut(); BC.out = opts.spine.el; BC.out.classList.add('out');
      fly = S.fly = makeFlyer(book, opts.spine.rect, to);
    } else if (!caseMode && it && it.b === book && it.vis) from = it.cover.getBoundingClientRect();
  }
  const { words, rv, steps } = detailEls();

  gsap.set(E.dSheet, { opacity: 0, xPercent: 5, rotate: 2.2, transformOrigin: '85% 60%' });
  gsap.set(words, { yPercent: 135 });
  gsap.set(rv, { opacity: 0, y: 20 });
  gsap.set(steps, { opacity: 0 });
  if (it && !caseMode) it.el.classList.add('lifted');

  const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete() { if (fly) fly.destroy(); if (opts.then) opts.then(); } });
  S.tl = tl;
  tl.to(S, { ent: 0, duration: dur(.8), ease: 'power3.inOut', onUpdate: dirty }, 0)
    .to([E.filters, E.nowWrap], { opacity: 0, duration: dur(.4), ease: 'power2.out' }, 0)
    .to(E.dSheet, { opacity: 1, xPercent: 0, rotate: 0, duration: dur(1.05) }, .05);
  if (fly) {
    gsap.set(E.dCover, { opacity: 0 });
    tl.add(flyTween(fly, 0, 1, dur(1.15)), 0)
      .set(E.dCover, { opacity: 1 }, dur(1.15))
      .add(() => fly.destroy(), dur(1.15) + .03);
  } else if (from) {
    const dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2);
    gsap.set(E.dCover, { x: dx, y: dy, scale: from.width / to.width });
    tl.to(E.dCover, { x: 0, y: 0, scale: 1, duration: dur(1.15), ease: 'expo.inOut' }, 0);
  } else {
    tl.fromTo(E.dCover, { opacity: 0, y: 36, scale: .97 }, { opacity: 1, y: 0, scale: 1, duration: dur(1) }, .15);
  }
  tl.to(words, { yPercent: 0, duration: dur(1.05), stagger: .055 }, .42)
    .to(rv, { opacity: 1, y: 0, duration: dur(.95), stagger: .07 }, .55)
    .to(steps, { opacity: 1, duration: dur(.8) }, .85);
}

function doCloseDetail() {
  if (S.view !== 'detail') return;
  setView('closing');
  if (S.tl) S.tl.kill();
  if (S.fly) { S.fly.destroy(); gsap.set(E.dCover, { opacity: 1 }); }
  gsap.killTweensOf([E.dCover, E.dSheet, S]);
  clearTimeout(nowTimer);
  gsap.killTweensOf([E.nowTitle, E.nowKicker, E.nowDate]);
  gsap.set([E.nowTitle, E.nowKicker, E.nowDate], { y: 0, opacity: 1 });
  fillNow(S.book); S.nowId = S.book.id;
  const { words, rv, steps } = detailEls();
  const caseMode = S.mode === 'case';
  let tgt = null;
  if (caseMode) tgt = caseEnsureVisible(S.book);
  const to = E.dCover.getBoundingClientRect();
  let r = null;
  if (!caseMode) { r = activeCoverRect(); const live = activeItem(); if (live) live.el.classList.add('lifted'); }
  let fly = null;
  if (tgt) {
    const a = tgt.getBoundingClientRect();
    if (a.width > 4 && a.bottom > 0 && a.top < innerHeight && !REDUCE) {
      releaseOut(); BC.out = tgt; tgt.classList.add('out');
      fly = S.fly = makeFlyer(S.book, a, to);
      gsap.set(E.dCover, { opacity: 0 });
    }
  }
  const tl = gsap.timeline({
    defaults: { ease: 'expo.inOut' },
    onComplete() {
      if (fly) fly.destroy();
      releaseOut();
      $$('.item.lifted', E.rail).forEach(el => el.classList.remove('lifted'));
      E.detail.classList.remove('is-open'); E.detail.setAttribute('aria-hidden', 'true');
      gsap.set(E.dCover, { clearProps: 'transform,opacity' });
      body.classList.remove('is-inside'); setView('shelf'); S.idle = 0; dirty();
      if (tgt) pulse(tgt);
      const fb = S.focusBack; S.focusBack = null;
      if (fb && fb !== body && fb.isConnected && fb.focus) { try { fb.focus({ preventScroll: true }); } catch (_) {} }
      flushRoute();
    },
  });
  tl.to(steps, { opacity: 0, duration: dur(.25), ease: 'power2.out' }, 0)
    .to(rv, { opacity: 0, y: -12, duration: dur(.4), stagger: .03, ease: 'power3.in' }, 0)
    .to(words, { yPercent: -135, duration: dur(.5), stagger: .03, ease: 'power3.in' }, 0);
  if (fly) {
    tl.add(flyTween(fly, 1, 0, dur(1.05)), .1);
  } else if (r) {
    const dx = r.left + r.width / 2 - (to.left + to.width / 2), dy = r.top + r.height / 2 - (to.top + to.height / 2);
    tl.to(E.dCover, { x: dx, y: dy, scale: r.width / to.width, duration: dur(1.0) }, .12);
  } else tl.to(E.dCover, { opacity: 0, y: 30, duration: dur(.5) }, .1);
  tl.to(E.dSheet, { opacity: 0, xPercent: 4, rotate: 1.6, duration: dur(.8), ease: 'power3.inOut' }, .25)
    .to([E.filters, E.nowWrap], { opacity: 1, duration: dur(.6), ease: 'power2.out' }, .5);
  if (!caseMode) tl.to(S, { ent: 1, duration: dur(1.3), ease: 'power3.out', onUpdate: dirty }, .38);   // in the bookcase the ring stays folded away
}

/* swap the book shown on the page (prev / next / history) */
let stepBusy = false;
function showBook(next, dir, replaceHistory) {
  stepBusy = true;
  if (S.tl) S.tl.kill();
  const idx = S.list.indexOf(next);
  if (idx >= 0) goTo(idx, true);
  S.lastAct = -1; dirty();
  const { words, rv } = detailEls();
  const tl = gsap.timeline({ onComplete() { stepBusy = false; } });
  tl.to(rv, { opacity: 0, y: -10, duration: dur(.28), stagger: .02, ease: 'power2.in' }, 0)
    .to(words, { yPercent: -135, duration: dur(.34), stagger: .02, ease: 'power3.in' }, 0)
    .to(E.dCover, { x: -70 * dir, opacity: 0, duration: dur(.4), ease: 'power3.in' }, 0)
    .add(() => {
      fillDetail(next);
      if (replaceHistory) hrepl(hashOf(next), 1);
      const w2 = $$('.d-title .w > span', E.dTitle), rv2 = $$('.rv', E.dText);
      gsap.set(w2, { yPercent: 135 }); gsap.set(rv2, { opacity: 0, y: 20 });
      gsap.set(E.dCover, { x: 90 * dir, opacity: 0 });
      gsap.timeline()
        .to(E.dCover, { x: 0, opacity: 1, duration: dur(1), ease: 'expo.out' }, 0)
        .to(w2, { yPercent: 0, duration: dur(1), stagger: .05, ease: 'expo.out' }, .08)
        .to(rv2, { opacity: 1, y: 0, duration: dur(.9), stagger: .06, ease: 'expo.out' }, .18);
    });
}
function stepDetail(dir) {
  if (S.view !== 'detail' || stepBusy) return;
  showBook(bookAtIdx(activeIdx() + dir), dir, true);
}
function swapDetail(b) {
  if (S.view !== 'detail' || b === S.book) return;
  const i = S.list.indexOf(b), j = S.list.indexOf(S.book);
  showBook(b, i >= j ? 1 : -1, false);
}

E.dPrev.addEventListener('click', () => stepDetail(-1));
E.dNext.addEventListener('click', () => stepDetail(1));
E.dRead.addEventListener('click', () => S.view === 'detail' && openReader(S.book, 0));
E.dCover.addEventListener('click', () => S.view === 'detail' && openReader(S.book, 0));
E.dInside.addEventListener('click', e => { const b = e.target.closest('button'); if (b && S.view === 'detail') openReader(S.book, isDoc(S.book) ? S.book.doc.pg[+b.dataset.i] - 1 : +b.dataset.i); });

/* ── reader ─────────────────────────────────────────────── */
const chromeEls = () => [$('.brand'), $('.top-r'), E.foot];
const RD = { i: 0, front: null, back: null, busy: false, zoom: false, swiped: false, suppress: false };
function slideURL(b, i) { return enc(b.dir + '/' + b.files[clamp(i, 0, b.files.length - 1)]); }

/* Full-length books open in the browser's own PDF viewer inside the reader. The files live in Books/
   next to index.html and are not published with the site, so when they are not reachable (e.g. on the
   hosted copy) the reader offers the book's official free download instead. */
const LOCAL_FILES = location.protocol === 'file:';
const docOK = new Map();
function docAvailable(b) {
  if (LOCAL_FILES) return Promise.resolve(true);
  if (!docOK.has(b.id)) docOK.set(b.id, fetch(enc(b.doc.path), { method: 'HEAD' }).then(r => r.ok).catch(() => false));
  return docOK.get(b.id);
}
const rDoc = document.createElement('div');
rDoc.className = 'r-doc';
rDoc.innerHTML = '<iframe title="Book"></iframe><div class="r-docmsg"><p class="r-dm-t"></p><p class="r-dm-s"></p><div class="r-dm-a"></div></div>';
E.rStage.appendChild(rDoc);
const rFrame = rDoc.firstChild, rMsg = rDoc.lastChild;
const rOpen = document.createElement('a');                    // escape hatch: the PDF in its own tab
rOpen.className = 'r-open'; rOpen.target = '_blank'; rOpen.rel = 'noopener'; rOpen.dataset.cursor = 'btn';
rOpen.innerHTML = '<span>Open PDF</span><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2.5 9.5 9.5 2.5M3.5 2.5h6v6"/></svg>';
E.rClose.parentNode.insertBefore(rOpen, E.rClose);
function docMessage(b, local) {
  const d = b.doc, epub = d.fmt === 'EPUB' && local;
  const link = (href, label, ghost, dl) => `<a class="btn${ghost ? ' ghost' : ''}" href="${esc(href)}" target="_blank" rel="noopener"${dl ? ' download' : ''} data-cursor="btn"><span>${label}</span></a>`;
  rMsg.querySelector('.r-dm-t').textContent = epub ? 'This book is an EPUB' : 'This book is not stored on this copy of the site';
  rMsg.querySelector('.r-dm-s').textContent = epub
    ? 'Browsers cannot display EPUB files. Open it in an e-reader app such as Calibre, Thorium or Apple Books.'
    : `Read it free from its official source (${d.site || b.sourceLabel}). Licence: ${d.license}.`;
  rMsg.querySelector('.r-dm-a').innerHTML = (epub ? link(enc(d.path), 'Open the EPUB', false, true) : '') +
    (b.source ? link(b.source, 'Official download ↗', epub) : '');
  rDoc.classList.add('msg');
}
function openDoc(b, page) {
  rDoc.classList.remove('msg', 'on'); rOpen.classList.remove('on');
  rFrame.removeAttribute('src');
  docAvailable(b).then(ok => {
    if (S.book !== b || S.view !== 'reader') return;
    if (!ok || b.doc.fmt !== 'PDF') { docMessage(b, ok); return; }
    rFrame.onload = () => rDoc.classList.add('on');
    rFrame.src = enc(b.doc.path) + '#page=' + page;
    rOpen.href = enc(b.doc.path) + '#page=' + page; rOpen.classList.add('on');
  });
}

function doOpenReader(book, start, instant) {
  if (S.view !== 'detail') return;
  setView('reader'); body.classList.add('in-reader');
  gsap.killTweensOf(E.reader);
  gsap.to(chromeEls(), { opacity: 0, duration: dur(.5), ease: 'power2.out', overwrite: true });
  RD.i = clamp(start || 0, 0, book.slides - 1); RD.busy = false; RD.zoom = false;
  RD.front = E.rA; RD.back = E.rB;
  E.rStage.classList.remove('zoomed');
  E.rTitle.textContent = book.title; E.rTot.textContent = pad(book.slides, 2);
  E.reader.classList.toggle('is-doc', isDoc(book));
  if (isDoc(book)) { E.rThumbs.innerHTML = ''; openDoc(book, RD.i + 1); }
  else {
    E.rThumbs.innerHTML = book.files.map((f, i) => `<button data-i="${i}" data-cursor="btn" aria-label="Slide ${i + 1}"><img alt="" loading="lazy" decoding="async" src="${enc(book.dir + '/' + f)}"></button>`).join('');
    RD.front.src = slideURL(book, RD.i);
  }
  gsap.set([E.rA, E.rB], { x: 0, y: 0, scale: 1, opacity: 0 });
  syncReader(true);
  E.reader.classList.add('is-open'); E.reader.setAttribute('aria-hidden', 'false');
  const tl = gsap.timeline();
  tl.fromTo(E.reader, { yPercent: 100 }, { yPercent: 0, duration: dur(instant ? .01 : 1.0), ease: 'expo.inOut' }, 0)
    .fromTo(isDoc(book) ? rDoc : RD.front, { opacity: 0, y: 60, scale: .96 }, { opacity: 1, y: 0, scale: 1, duration: dur(1.1), ease: 'expo.out', clearProps: isDoc(book) ? 'transform' : '' }, instant ? 0 : .45)
    .fromTo([$('.r-bar'), E.rThumbs, E.rPrev, E.rNext], { opacity: 0 }, { opacity: 1, duration: dur(.8), ease: 'power2.out', stagger: .05, clearProps: 'opacity' }, instant ? 0 : .6);
  if (!isDoc(book)) preloadAround(book, RD.i);
}
function syncReader(instantThumb) {
  const b = S.book;
  E.rCur.textContent = pad(RD.i + 1, 2);
  E.rPrev.disabled = RD.i <= 0; E.rNext.disabled = RD.i >= b.slides - 1;
  $$('button', E.rThumbs).forEach((t, i) => t.classList.toggle('on', i === RD.i));
  const on = $('button.on', E.rThumbs);
  if (on) {
    const c = E.rThumbs, target = on.offsetLeft - c.clientWidth / 2 + on.clientWidth / 2;
    if (instantThumb) c.scrollLeft = target; else c.scrollTo({ left: target, behavior: 'smooth' });
  }
  if (S.view === 'reader') hrepl(hashOf(b, true, RD.i), 2);
}
function preloadAround(b, i) { [i - 1, i + 1, i + 2].forEach(j => { if (j >= 0 && j < b.slides) { const im = new Image(); im.src = slideURL(b, j); } }); }
function readerStep(d) { readerGo(RD.i + d, d); }
function readerGo(i, dir) {
  const b = S.book; if (isDoc(b)) return;
  i = clamp(i, 0, b.slides - 1);
  if (i === RD.i || RD.busy) return;
  dir = dir || (i > RD.i ? 1 : -1);
  RD.busy = true;
  if (RD.zoom) setZoom(false, true);
  const inc = RD.back, out = RD.front;
  inc.src = slideURL(b, i);
  const go = () => {
    gsap.fromTo(inc, { x: 90 * dir, opacity: 0, scale: .985 }, { x: 0, opacity: 1, scale: 1, duration: dur(.9), ease: 'expo.out' });
    gsap.to(out, { x: -70 * dir, opacity: 0, scale: .985, duration: dur(.55), ease: 'power3.out', onComplete() { gsap.set(out, { x: 0, scale: 1 }); RD.busy = false; } });
    RD.front = inc; RD.back = out; RD.i = i; syncReader(); preloadAround(b, i);
  };
  inc.decode ? inc.decode().then(go, go) : go();
}
function setZoom(on, fast) {
  RD.zoom = on; E.rStage.classList.toggle('zoomed', on);
  gsap.to(RD.front, { scale: on ? 2.1 : 1, x: 0, y: 0, duration: dur(fast ? .25 : .75), ease: 'expo.out', overwrite: 'auto' });
}
E.rStage.addEventListener('click', e => {
  if (S.view !== 'reader' || isDoc(S.book)) return;
  if (RD.swiped || RD.suppress) { RD.swiped = RD.suppress = false; return; }
  if (e.target.closest('.r-nav')) return;
  setZoom(!RD.zoom);
  if (RD.zoom) panTo(e);
});
function panTo(e) {
  const r = E.rStage.getBoundingClientRect();
  const nx = clamp((e.clientX - r.left) / r.width, 0, 1) - .5, ny = clamp((e.clientY - r.top) / r.height, 0, 1) - .5;
  const w = RD.front.offsetWidth, h = RD.front.offsetHeight;
  gsap.to(RD.front, { x: -nx * w * 1.1, y: -ny * h * 1.1, duration: dur(.8), ease: 'power3.out', overwrite: 'auto' });
}
let sw = null, pan = null;
E.rStage.addEventListener('pointermove', e => {
  if (RD.zoom && e.pointerType === 'mouse') { panTo(e); return; }
  if (pan && RD.zoom && e.pointerId === pan.id) {                          // finger / pen: drag the zoomed page around
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) pan.moved = true;
    const lx = RD.front.offsetWidth * .55, ly = RD.front.offsetHeight * .55;
    gsap.set(RD.front, { x: clamp(pan.fx + dx, -lx, lx), y: clamp(pan.fy + dy, -ly, ly) });
  }
});
E.rStage.addEventListener('pointerdown', e => {
  sw = { x: e.clientX, y: e.clientY, t: performance.now() };
  pan = RD.zoom && e.pointerType !== 'mouse' ? { id: e.pointerId, x: e.clientX, y: e.clientY, fx: +gsap.getProperty(RD.front, 'x') || 0, fy: +gsap.getProperty(RD.front, 'y') || 0, moved: false } : null;
});
E.rStage.addEventListener('pointerup', e => {
  if (pan) { if (pan.moved) { RD.suppress = true; setTimeout(() => { RD.suppress = false; }, 80); } pan = null; sw = null; return; }
  if (!sw || RD.zoom) { sw = null; return; }
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.3) { RD.swiped = true; setTimeout(() => { RD.swiped = false; }, 80); readerStep(dx < 0 ? 1 : -1); }
  sw = null;
});
E.rStage.addEventListener('pointercancel', () => { sw = null; pan = null; });
E.rStage.addEventListener('wheel', e => {
  if (S.view !== 'reader' || RD.zoom || isDoc(S.book)) return;
  e.preventDefault();
  const now = performance.now(); if (now - (RD.wheelT || 0) < 520) return;
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(d) > 12) { RD.wheelT = now; readerStep(d > 0 ? 1 : -1); }
}, { passive: false });
E.rPrev.addEventListener('click', () => readerStep(-1));
E.rNext.addEventListener('click', () => readerStep(1));
E.rThumbs.addEventListener('click', e => { const b = e.target.closest('button'); if (b) readerGo(+b.dataset.i); });
E.rClose.addEventListener('click', () => closeReader());
function doCloseReader(keepChrome) {
  if (S.view !== 'reader') return;
  setView('detail'); body.classList.remove('in-reader');
  if (!keepChrome) gsap.to(chromeEls(), { opacity: 1, duration: dur(.7), ease: 'power2.out', overwrite: true, delay: .25, clearProps: 'opacity' });
  else gsap.set(chromeEls(), { clearProps: 'opacity' });
  if (RD.zoom) setZoom(false, true);
  gsap.timeline({ onComplete() { if (S.view !== 'reader') { E.reader.classList.remove('is-open', 'is-doc'); E.reader.setAttribute('aria-hidden', 'true'); rFrame.removeAttribute('src'); rDoc.classList.remove('on', 'msg'); } } })
    .to(E.reader, { yPercent: 100, duration: dur(.9), ease: 'expo.inOut' });
}

/* ── round button (search ⇄ back) ───────────────────────── */
E.round.addEventListener('click', () => {
  if (S.view === 'reader') closeReader();
  else if (S.view === 'detail') closeDetail();
  else if (S.view === 'shelf') toggleSearch();
});

/* ── search ─────────────────────────────────────────────── */
const SIDX = ALL.map(b => ({ b, hay: [b.title, b.short, TOPIC_LABEL[b.topic], TYPE_LABEL[b.type], b.author, b.handle, b.tags.join(' '), b.date.slice(0, 4), 'no ' + b.n, b.doc ? [b.desc, b.doc.fmt, b.doc.license, b.doc.edition, b.doc.shelf].join(' ') : ''].join(' ').toLowerCase() }));
let sRes = [], sSel = 0;
function renderSearch(q) {
  q = q.trim().toLowerCase();
  let res;
  if (!q) res = ALL.slice(0, 8);
  else {
    const toks = q.split(/\s+/);
    res = SIDX.filter(x => toks.every(t => x.hay.includes(t))).map(x => {
      let s = 0; const ti = x.b.title.toLowerCase();
      toks.forEach(t => { if (ti.startsWith(t)) s += 4; else if (ti.includes(' ' + t)) s += 2; else if (ti.includes(t)) s += 1; });
      return { b: x.b, s };
    }).sort((a, b) => b.s - a.s || b.b.n - a.b.n).slice(0, 40).map(x => x.b);
  }
  sRes = res; sSel = 0;
  E.sCount.textContent = q ? `${res.length} found` : 'Latest additions';
  E.sList.innerHTML = res.length ? res.map((b, i) =>
    `<li data-i="${i}" class="${i === 0 ? 'on' : ''}"><span class="th" style="background-image:url(${enc(b.thumb)})"></span><span><div class="tt">${esc(b.title)}</div><div class="mm">${TOPIC_LABEL[b.topic]} · ${TYPE_LABEL[b.type]} · ${amount(b)} · ${esc(when(b))}</div></span><span class="no">${NO()} ${pad(b.n)}</span></li>`).join('')
    : `<li class="none">Nothing on the shelf matches “${esc(q)}”.</li>`;
}
function markSel() {
  $$('li', E.sList).forEach((li, i) => li.classList.toggle('on', i === sSel));
  const on = $('li.on', E.sList); if (on) on.scrollIntoView({ block: 'nearest' });
}
function openSearch() {
  if (S.searchOpen || S.view !== 'shelf') return;
  S.searchOpen = true; hideTip(); E.search.classList.add('is-open'); E.search.setAttribute('aria-hidden', 'false');
  E.sInput.value = ''; renderSearch('');
  gsap.fromTo(E.sVeil, { opacity: 0 }, { opacity: 1, duration: dur(.5), ease: 'power2.out' });
  gsap.fromTo(E.sBox, { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: dur(.8), ease: 'expo.out' });
  gsap.fromTo($$('li', E.sList), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: dur(.7), stagger: .035, ease: 'expo.out', delay: .12 });
  setTimeout(() => E.sInput.focus(), 60);
}
function closeSearch() {
  if (!S.searchOpen) return;
  S.searchOpen = false; E.sInput.blur();
  gsap.timeline({ onComplete() { if (!S.searchOpen) { E.search.classList.remove('is-open'); E.search.setAttribute('aria-hidden', 'true'); } } })
    .to(E.sBox, { y: 14, opacity: 0, duration: dur(.3), ease: 'power2.in' }, 0)
    .to(E.sVeil, { opacity: 0, duration: dur(.4), ease: 'power2.out' }, .05);
}
function toggleSearch() { S.searchOpen ? closeSearch() : openSearch(); }
function pickBook(b) {
  closeSearch();
  if (S.list.indexOf(b) < 0) { applyFilter({ type: 'all', topic: 'all' }, b); return; }
  if (S.mode === 'case') { caseLocate(b); return; }
  goTo(S.list.indexOf(b));
}
E.sInput.addEventListener('input', () => renderSearch(E.sInput.value));
E.sInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); sSel = Math.min(sRes.length - 1, sSel + 1); markSel(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sSel = Math.max(0, sSel - 1); markSel(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (sRes[sSel]) pickBook(sRes[sSel]); }
  else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
});
E.sList.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) pickBook(sRes[+li.dataset.i]); });
E.sList.addEventListener('pointermove', e => { const li = e.target.closest('li[data-i]'); if (li && +li.dataset.i !== sSel) { sSel = +li.dataset.i; markSel(); } });
E.sVeil.addEventListener('click', closeSearch);
E.footSearch.addEventListener('click', () => S.view === 'shelf' && openSearch());

/* ═══════════════════════ bookcase ═══════════════════════
   every book of the current filter, standing on shelves grouped by topic,
   spines facing out, heights almost-but-not-quite equal, a brass plate per shelf */
const BC = { rows: [], els: new Map(), key: '', focus: null, last: null, out: null, tipId: '', tipT: 0, gen: 0 };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
const cssPx = (el, name, d) => { const v = parseFloat(getComputedStyle(el).getPropertyValue(name)); return isFinite(v) ? v : d; };
const bookHeight = (b, base) => base * (.95 + ((hash(b.id) >> 6) % 6) / 100);              // 95 – 100 % : tidy, but alive

function caseDims() {
  const bookH = cssPx(E.bc, '--bookH', 240), side = cssPx(E.bc, '--side', 34), padX = cssPx(E.bc, '--rowPad', 16), gap = cssPx(E.bc, '--bgap', 2);
  const inner = Math.floor(E.bcBody.clientWidth - side * 2 - padX * 2 - 8);
  return { bookH, side, padX, gap, inner };
}
function packRows(list, d) {
  const rows = [], room = 26;                                         // space kept for the bookend
  TOPICS.forEach(t => {
    const bs = list.filter(b => b.topic === t.key); if (!bs.length) return;
    let cur = null, part = 0; const first = rows.length;
    bs.forEach(b => {
      const h = bookHeight(b, d.bookH), w = thick(b, h);
      if (!cur || cur.w + d.gap + w > d.inner - room) { cur = { topic: t, part: ++part, items: [], w: 0, total: bs.length, parts: 1, end: false }; rows.push(cur); }
      cur.items.push({ b, h, w }); cur.w += (cur.items.length > 1 ? d.gap : 0) + w;
    });
    rows.slice(first).forEach(r => { r.parts = part; });
    rows[rows.length - 1].end = true;
  });
  return rows;
}
function bkHTML({ b, h, w }) {
  const p = palette(b);
  return `<button class="bk sp ${p.cls}" data-id="${b.id}" data-e="${p.emb}" tabindex="-1" style="--T:${w.toFixed(2)}px;--H:${h.toFixed(1)}px;--chars:${Math.max(7, b.short.length)}" aria-label="${esc(b.title)} — ${esc(TOPIC_LABEL[b.topic])}, ${amount(b)}">${spineInner(b)}</button>`;
}
function rowHTML(r) {
  const tag = r.part === 1 ? r.total : (ROMAN[r.part] || r.part);
  return `<div class="bc-row" data-topic="${r.topic.key}" role="listitem"><div class="bc-books">${r.items.map(bkHTML).join('')}${r.end ? '<i class="bookend"></i>' : ''}</div>` +
    `<div class="bc-plank"><span class="bc-label">${esc(r.topic.label)}<em>${tag}</em></span><span class="bc-part">${r.parts > 1 ? `${r.part} / ${r.parts}` : ''}</span></div></div>`;
}
function buildCase(force) {
  const d = caseDims();
  const key = `${S.filter.type}|${S.filter.topic}|${d.inner}|${d.bookH}|${S.list.length}`;
  if (!force && BC.key === key && BC.els.size) return false;
  BC.key = key; BC.gen++;
  BC.rows = packRows(S.list, d);
  E.bcBody.innerHTML = BC.rows.map(rowHTML).join('');
  BC.els = new Map($$('.bk', E.bcBody).map(el => [el.dataset.id, el]));
  const slides = S.list.reduce((n, b) => n + (isDoc(b) ? 0 : b.slides), 0), pages = S.list.reduce((n, b) => n + (isDoc(b) ? b.slides : 0), 0);
  E.bcCount.textContent = `${S.list.length} ${S.list.length === 1 ? 'volume' : 'volumes'}` + (slides ? `  ·  ${slides.toLocaleString('en')} slides` : '') + (pages ? `  ·  ${pages.toLocaleString('en')} pages` : '');
  const keep = (BC.focus && BC.els.get(BC.focus)) || BC.els.values().next().value;
  if (keep) { keep.tabIndex = 0; BC.focus = keep.dataset.id; }
  return true;
}
function setRoving(el) {
  const old = BC.focus && BC.els.get(BC.focus); if (old && old !== el) old.tabIndex = -1;
  el.tabIndex = 0; BC.focus = el.dataset.id;
}
/* entrance: shelves rise, the first books settle in */
function caseIn(instant) {
  const rows = $$('.bc-row', E.bcBody);
  gsap.killTweensOf([E.bcCrown, ...rows]);
  if (instant || REDUCE) { gsap.set([E.bcCrown, ...rows], { clearProps: 'transform,opacity' }); return; }
  const vh = innerHeight;
  const vis = rows.filter(r => { const t = r.getBoundingClientRect(); return t.bottom > 0 && t.top < vh; });       // only the shelves on screen animate
  E.bc.classList.add('anim');
  gsap.fromTo(E.bcCrown, { y: -26, opacity: 0 }, { y: 0, opacity: 1, duration: dur(.9), ease: 'expo.out', clearProps: 'transform,opacity' });
  gsap.fromTo(vis, { y: 46, opacity: 0 }, { y: 0, opacity: 1, duration: dur(1.05), stagger: .08, ease: 'expo.out', clearProps: 'transform,opacity', onComplete() { E.bc.classList.remove('anim'); } });
}
/* shelves are rendered lazily (content-visibility:auto). After the entrance we unlock the rest one at a time while idle,
   nearest first, so scrolling later never has to pay for a shelf's first paint. */
function unlockRows() {
  const rows = $$('.bc-row', E.bcBody).filter(r => !r.classList.contains('pre'));
  const mid = innerHeight / 2, gen = ++BC.gen;
  rows.sort((a, b) => Math.abs(a.getBoundingClientRect().top - mid) - Math.abs(b.getBoundingClientRect().top - mid));
  let i = 0;
  const next = () => { if (gen !== BC.gen || S.mode !== 'case' || i >= rows.length) return; rows[i++].classList.add('pre'); later(next, 90); };
  later(next, 1100);
}
/* The bookcase is locked (content-visibility) while the carousel is showing. Its first style + layout pass is the
   most expensive thing on the page (215 vertical titles to shape), so we pay for it behind the loader or when idle,
   in one synchronous task with no frame in between, and then lock it again with everything already computed. */
function warmCase() {
  if (S.mode === 'case' || !E.bcBody.firstChild) return;
  root.classList.add('warm-case'); void E.bcBody.offsetHeight; root.classList.remove('warm-case');
}
const later = (fn, ms) => setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2500 }) : fn()), ms);
function refreshCase() { if (S.mode === 'flow') { buildCase(); warmCase(); } }
document.addEventListener('themechange', () => {
  later(warmCase, 1600);
  if (S.book && (S.view === 'detail' || S.view === 'reader')) E.dNo.textContent = NO() + ' ' + pad(S.book.n);
  if (S.view === 'shelf' && S.mode === 'flow' && S.items.length) fillNow(activeBook());
});
function releaseOut() { if (BC.out) { BC.out.classList.remove('out'); BC.out = null; } }
function pulse(el) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 1900); }

/* scrolling helpers (the shelf scroller, never the page) */
function caseEnsureVisible(b) {
  const el = BC.els.get(b.id); if (!el) return null;
  const sc = E.caseScroll, top = cssPx(root, '--chromeTop', 170) + 14, bot = innerHeight - 56;
  const r = el.getBoundingClientRect();
  if (r.bottom < top - 40 || r.top > bot + 40) caseCenter(el, true);
  else if (r.top < top) sc.scrollTop += r.top - top;
  else if (r.bottom > bot) sc.scrollTop += r.bottom - bot;
  return el;
}
function caseCenter(el, instant) {
  const sc = E.caseScroll, r = el.getBoundingClientRect(), sr = sc.getBoundingClientRect();
  const want = sc.scrollTop + (r.top - sr.top) - (sr.height * .52 - r.height / 2);
  sc.scrollTo({ top: Math.max(0, want), behavior: instant || REDUCE ? 'auto' : 'smooth' });
}
function caseLocate(b) {                       // search result → bring it into view and pulse it
  const el = BC.els.get(b.id); if (!el) return;
  caseCenter(el, false); setRoving(el); BC.last = b.id;
  setTimeout(() => pulse(el), REDUCE ? 0 : 420);
}

/* hover card (the cover, which the spine hides) */
const tipOK = () => FINE && innerWidth > 720;
function showTip(el) {
  if (!tipOK()) return;
  const b = BOOK.get(el.dataset.id); if (!b) return;
  clearTimeout(BC.tipT);
  BC.tipT = setTimeout(() => {
    if (BC.tipId !== b.id) {
      E.tipTh.style.backgroundImage = `url(${enc(b.thumb)})`; E.tipTt.textContent = b.title;
      E.tipMm.textContent = `${TOPIC_LABEL[b.topic]} · ${amount(b)} · ${when(b)}`; BC.tipId = b.id;
    }
    const r = el.getBoundingClientRect(), tw = 244, th = E.tip.offsetHeight || 86;
    const x = clamp(r.left + r.width / 2 - tw / 2, 10, innerWidth - tw - 10);
    let y = r.top - th - 12;
    if (y < cssPx(root, '--chromeTop', 170) - 6) y = r.bottom + 14;
    const was = E.tip.classList.contains('on');
    if (!was) E.tip.classList.add('snap');
    E.tip.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    if (!was) { void E.tip.offsetWidth; E.tip.classList.remove('snap'); }
    E.tip.classList.add('on');
  }, E.tip.classList.contains('on') ? 0 : 150);
}
function hideTip() { clearTimeout(BC.tipT); E.tip.classList.remove('on'); }

function caseOpen(el) {
  if (S.view !== 'shelf' || S.mode !== 'case' || modeBusy || filterBusy) return;
  const b = BOOK.get(el.dataset.id); if (!b) return;
  hideTip(); BC.last = b.id; setRoving(el);
  const idx = S.list.indexOf(b); if (idx >= 0) goTo(idx, true);
  openDetail(b, { spine: { el, rect: el.getBoundingClientRect() } });
}
E.bcBody.addEventListener('click', e => { const el = e.target.closest('.bk'); if (el) caseOpen(el); });
E.bcBody.addEventListener('pointerover', e => { const el = e.target.closest('.bk'); if (el && e.pointerType === 'mouse') { BC.last = el.dataset.id; showTip(el); } });
E.bcBody.addEventListener('pointerout', e => { const el = e.target.closest('.bk'); if (el && !el.contains(e.relatedTarget)) hideTip(); });
E.bcBody.addEventListener('focusin', e => { const el = e.target.closest('.bk'); if (el) { setRoving(el); BC.last = el.dataset.id; showTip(el); } });
E.bcBody.addEventListener('focusout', hideTip);
E.caseScroll.addEventListener('scroll', hideTip, { passive: true });
E.bcBody.addEventListener('keydown', e => {
  const el = e.target.closest('.bk'); if (!el) return;
  const all = $$('.bk', E.bcBody), i = all.indexOf(el); let to = null;
  if (e.key === 'ArrowRight') to = all[i + 1];
  else if (e.key === 'ArrowLeft') to = all[i - 1];
  else if (e.key === 'Home') to = all[0];
  else if (e.key === 'End') to = all[all.length - 1];
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const rows = $$('.bc-row', E.bcBody), nr = rows[rows.indexOf(el.closest('.bc-row')) + (e.key === 'ArrowDown' ? 1 : -1)];
    if (nr) { const x = el.getBoundingClientRect().left; to = $$('.bk', nr).reduce((a, c) => Math.abs(c.getBoundingClientRect().left - x) < Math.abs(a.getBoundingClientRect().left - x) ? c : a); }
  }
  if (to) { e.preventDefault(); to.focus({ preventScroll: true }); caseEnsureVisible(BOOK.get(to.dataset.id)); }
});

/* filter change while the bookcase is showing */
function applyFilterCase(list, cur, focusBook) {
  hideTip();
  const swap = () => {
    S.list = list; buildRing();
    const idx = Math.max(0, list.indexOf(cur));
    S.pos = S.target = idx; S.lastAct = -1; S.nowId = ''; S.ent = 0;
    const a = bookAtIdx(idx); fillNow(a); S.nowId = a.id;
    countTo(list.length);
    buildCase(true); E.caseScroll.scrollTop = 0;
    caseIn(); unlockRows();
    if (focusBook) { const el = BC.els.get(focusBook.id); if (el) { setTimeout(() => { caseCenter(el, false); setRoving(el); }, 350); setTimeout(() => pulse(el), 900); } }
    filterBusy = false; flushRoute();
  };
  gsap.killTweensOf([E.bcBody, $$('.bc-row', E.bcBody)]);
  gsap.to(E.bcBody, { opacity: 0, y: 14, duration: dur(.3), ease: 'power2.in', onComplete() { gsap.set(E.bcBody, { clearProps: 'opacity,transform' }); swap(); } });
}

/* ── view modes : carousel ⇄ bookcase ───────────────────── */
function syncViewUI() {
  const toCase = S.mode === 'flow';
  E.viewBtn.setAttribute('aria-label', toCase ? 'Switch to bookcase view' : 'Switch to carousel view');
  E.viewBtn.dataset.tip = toCase ? 'Bookcase' : 'Carousel';
  E.caseEl.setAttribute('aria-hidden', S.mode === 'case' ? 'false' : 'true');
}
function setMode(m) {
  if (m === S.mode || S.view !== 'shelf' || modeBusy || filterBusy) return;
  modeBusy = true; hideTip();
  store.set('library.view', m);
  const done = () => { modeBusy = false; flushRoute(); };
  gsap.killTweensOf(S, 'ent'); gsap.killTweensOf([E.nowWrap, ...E.deco]);
  if (m === 'case') {
    buildCase();
    S.mode = 'case';
    const lb = (BC.last && BC.els.get(BC.last)) || BC.els.get(activeBook().id);
    root.classList.add('case-pre');                                       // unlock the bookcase now: invisible, underneath, so its first paint lands at the click
    if (lb) caseCenter(lb, true); else E.caseScroll.scrollTop = 0;        // and open it on the book you were just looking at
    const tl = gsap.timeline({ onComplete: done });
    tl.to(S, { ent: 0, duration: dur(.55), ease: 'power2.in', onUpdate: dirty }, 0)
      .to([E.nowWrap, ...E.deco], { opacity: 0, duration: dur(.35), ease: 'power2.out' }, 0)
      .add(() => { root.setAttribute('data-view', 'case'); root.classList.remove('case-pre'); syncViewUI(); caseIn(); if (lb) setTimeout(() => pulse(lb), 800); unlockRows(); }, dur(.5));
  } else {
    const lb = BC.last && BOOK.get(BC.last);
    if (lb) { const i = S.list.indexOf(lb); if (i >= 0) { S.pos = S.target = i; S.lastAct = -1; } }
    const a = activeBook(); fillNow(a); S.nowId = a.id;
    S.mode = 'flow';
    root.classList.add('flow-pre');                                       // unlock the carousel now, while it is still folded away
    const vh = innerHeight;
    const rows = $$('.bc-row', E.bcBody).filter(r => { const t = r.getBoundingClientRect(); return t.bottom > 0 && t.top < vh; });   // only the shelves on screen
    E.bc.classList.add('anim');
    const tl = gsap.timeline({ onComplete: done });
    tl.to(rows.concat([E.bcCrown]), { y: 24, opacity: 0, duration: dur(.35), stagger: .02, ease: 'power2.in' }, 0)
      .add(() => {
        root.setAttribute('data-view', 'flow'); root.classList.remove('flow-pre'); syncViewUI(); dirty();
        gsap.set(rows.concat([E.bcCrown]), { clearProps: 'transform,opacity' }); E.bc.classList.remove('anim');
        gsap.fromTo([E.nowWrap, ...E.deco], { opacity: 0 }, { opacity: 1, duration: dur(.8), ease: 'power2.out' });
        gsap.to(S, { ent: 1, duration: dur(1.7), ease: 'power3.out', onUpdate: dirty });
      }, dur(.4));
  }
}
E.viewBtn.addEventListener('click', () => setMode(S.mode === 'flow' ? 'case' : 'flow'));

/* ── resize ─────────────────────────────────────────────── */
let rzT = 0;
addEventListener('resize', () => {
  clearTimeout(rzT);
  rzT = setTimeout(() => {
    const oldR = S.R; measure();
    if (S.items.length < 2 * S.R + 8 || S.R !== oldR) { const p = S.pos; buildRing(); S.pos = S.target = Math.round(p); }
    dirty(); moveInd();
    if (buildCase()) { caseIn(true); later(warmCase, 200); }
    if (S.view === 'shelf') hideTip();
  }, 120);
});

/* ── boot ───────────────────────────────────────────────── */
function boot() {
  if (/[?&]debug/.test(location.search)) {      // logs who moves the shelf (dev only)
    let _t = S.target; window.__tlog = [];
    Object.defineProperty(S, 'target', { get() { return _t; }, set(v) { if (Math.abs(v - _t) > 0.5) window.__tlog.push({ from: _t, to: v, at: Math.round(performance.now()), stack: new Error().stack.split('\n').slice(2, 5).join(' | ') }); _t = v; } });
  }
  buildFilters();
  measure();
  buildRing();
  S.pos = S.target = 0; S.ent = 0;
  syncViewUI();
  buildCase();
  const first = S.list[0]; fillNow(first); S.nowId = first.id; E.metaCount.textContent = ALL.length;
  render();
  requestAnimationFrame(tick);

  // preload the first covers so the opening frame is never empty; the loader bar follows the real work
  const books = S.list.slice(0, 9).concat(S.list.slice(-2));
  let done = 0; const total = books.length + 1;
  const bump = () => { done++; gsap.to(E.ldBar, { scaleX: Math.min(1, done / total), duration: .45, ease: 'power2.out', overwrite: true }); };
  const warm = books.map(b => { const im = new Image(); im.decoding = 'async'; im.src = enc(HIDPI ? b.cover : b.thumb); return (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(bump); });
  const fonts = (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { moveInd(); bump(); warmCase(); });
  const hold = new Promise(r => setTimeout(r, REDUCE ? 0 : 800));
  Promise.race([Promise.all([fonts, Promise.all(warm), hold]), new Promise(r => setTimeout(r, 2800))]).then(intro);
}
function intro() {
  root.classList.remove('is-loading');
  setView('shelf');
  const tl = gsap.timeline();
  gsap.set([E.filters, E.nowWrap, E.foot], { opacity: 1 });
  gsap.to(E.ldBar, { scaleX: 1, duration: .25, overwrite: true });
  gsap.timeline({ onComplete() { E.loader.classList.add('gone'); } })
    .to('.ld-in', { y: -16, opacity: 0, duration: dur(.5), ease: 'power2.in' }, .1)
    .to(E.loader, { yPercent: -100, duration: dur(1.05), ease: 'expo.inOut' }, .42);
  const at = REDUCE ? 0 : .5;
  tl.fromTo('.top-l, .brand, .top-r', { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: dur(1.1), stagger: .09, ease: 'expo.out', clearProps: 'opacity,transform' }, at)
    .from(E.filters, { y: -10, opacity: 0, duration: dur(1.1), ease: 'expo.out' }, at + .15)
    .fromTo(E.foot, { opacity: 0 }, { opacity: 1, duration: dur(1.1), ease: 'power2.out', clearProps: 'opacity' }, at + .9);
  if (S.mode === 'case') {
    gsap.set([E.nowWrap, ...E.deco], { opacity: 0 });
    gsap.delayedCall(at + .15, () => { caseIn(); unlockRows(); });
  } else {
    tl.from([E.nowTitle, E.nowKicker, E.nowDate], { y: 18, opacity: 0, duration: dur(1.2), stagger: .07, ease: 'expo.out' }, at + .75)
      .fromTo([E.prev, E.next], { opacity: 0 }, { opacity: 1, duration: dur(1.1), ease: 'power2.out', clearProps: 'opacity' }, at + .9);
    S.pos = REDUCE ? 0 : 5.2; S.target = 0;
    gsap.to(S, { ent: 1, duration: dur(2.1), ease: 'power3.out', delay: at - .1, onUpdate: dirty });
  }
  dirty();
  const t = parseHash();
  if (t) { if (hdepth() !== (t.read ? 2 : 1)) rebuildStack(t); applyRoute(t, true); }
  else hrepl(null, 0);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

// tiny debug handle
window.__lib = { S, BC, goTo, step, openDetail, closeDetail, openReader, closeReader, applyFilter, setMode };
})();
