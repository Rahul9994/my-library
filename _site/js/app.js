/* ───────────────────────────────────────────────────────────
   The Library — engine
   shelf (infinite 3D ring) · detail (shared-element flight) · reader · search
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

// types + topics come from the catalogue (built by tools/build_library.py), so new collections need no code changes
const TYPES = LIB.types || [], TOPICS = LIB.topics || [];
const typeInfo = k => TYPES.find(t => t.key === k) || { key: k, chip: k, label: k };
const topicInfo = k => TOPICS.find(t => t.key === k) || { key: k, chip: k, label: k, dot: '#999' };
const TYPE_LABEL = new Proxy({}, { get: (_, k) => typeInfo(k).label });
const TOPIC_LABEL = new Proxy({}, { get: (_, k) => topicInfo(k).label });

/* ── elements ───────────────────────────────────────────── */
const root = document.documentElement, body = document.body;
const E = {
  rail: $('#rail'), stage: $('#stage'), filters: $('#filters'), segType: $('#segType'), segTopic: $('#segTopic'),
  nowWrap: $('#nowWrap'), nowTitle: $('#nowTitle'), nowKicker: $('#nowKicker'), nowDate: $('#nowDate'),
  prev: $('#prevBtn'), next: $('#nextBtn'), round: $('#roundBtn'), metaCount: $('#metaCount'), top: $('.top'), foot: $('.foot'),
  detail: $('#detail'), dSheet: $('#dSheet'), dText: $('#dText'), dNo: $('#dNo'), dTopic: $('#dTopic'), dTitle: $('#dTitle'),
  dMeta: $('#dMeta'), dDesc: $('#dDesc'), dRead: $('#dRead'), dIg: $('#dIg'), dIgLabel: $('#dIgLabel'), dBy: $('#dBy'), footSearch: $('#footSearch'), dInside: $('#dInside'), dArt: $('#dArt'),
  dCover: $('#dCover'), dCoverImg: $('#dCover img'), dPrev: $('#dPrev'), dNext: $('#dNext'),
  reader: $('#reader'), rTitle: $('#rTitle'), rCur: $('#rCur'), rTot: $('#rTot'), rClose: $('#rClose'), rStage: $('#rStage'),
  rPage: $('#rPage'), rA: $('#rImgA'), rB: $('#rImgB'), rPrev: $('#rPrev'), rNext: $('#rNext'), rThumbs: $('#rThumbs'),
  search: $('#search'), sVeil: $('#sVeil'), sBox: $('.s-box'), sInput: $('#sInput'), sList: $('#sList'), sCount: $('#sCount'),
  cursor: $('#cursor'), cLabel: $('.c-label'),
};

/* ── state ──────────────────────────────────────────────── */
const S = {
  list: ALL.slice(), N: ALL.length, M: 0, items: [], vis: [],
  pos: 0, target: 0, lastPos: NaN, lastEnt: NaN, force: true, ent: 0, idle: 0, frame: 0,
  view: 'boot', filter: { type: 'all', topic: 'all' },
  vw: 1, vh: 1, H: 400, W: 320, gap: 6, pitch: 60, R: 12,
  nowId: '', book: null, hoverIdx: -1,
  tilt: { x: 0, y: 0, tx: 0, ty: 0 },
};
const dirty = () => { S.force = true; };
const bookAtIdx = i => S.list[mod(i, S.N)];
const activeIdx = () => mod(Math.round(S.pos), S.M);
const activeBook = () => bookAtIdx(activeIdx());
const settled = () => Math.abs(S.pos - Math.round(S.pos)) < 0.02 && Math.abs(S.target - S.pos) < 0.02;

/* ── metrics & ring ─────────────────────────────────────── */
const thick = b => S.H * clamp(.118 + .0042 * b.slides, .12, .19) * (.95 + (hash(b.id) % 100) / 1000);

function measure() {
  S.vw = innerWidth; S.vh = innerHeight;
  const small = S.vw < 720;
  const topZ = small ? 156 : 194, botZ = small ? 170 : 186;
  let H = clamp(S.vh - topZ - botZ, 210, 590), W = H * .8;
  const maxW = S.vw * (small ? .74 : .5);
  if (W > maxW) { W = maxW; H = W / .8; }
  S.H = Math.round(H); S.W = Math.round(S.H * .8);
  S.gap = Math.max(4, Math.round(S.H * .014));
  const railTop = topZ + Math.max(0, (S.vh - topZ - botZ - S.H) / 2);
  const st = root.style;
  st.setProperty('--H', S.H + 'px'); st.setProperty('--W', S.W + 'px'); st.setProperty('--railTop', railTop + 'px');
  S.pitch = S.H * .158 + S.gap;
  S.R = Math.ceil((S.vw / 2) / (S.H * .12 + S.gap)) + 3;
  S.items.forEach(it => { it.T = thick(it.b); it.el.style.setProperty('--T', it.T.toFixed(2) + 'px'); });
}

function itemHTML(b, i) {
  const v = hash(b.id), variant = v % 2, emb = (v >> 3) % 7;
  return `<div class="item sp-${b.topic}-${variant}" data-i="${i}"><div class="shadow"></div><div class="book">` +
    `<div class="face spine" data-e="${emb}" style="--chars:${Math.max(7, b.short.length)}">` +
    `<i class="emb"></i><span class="ttl">${esc(b.short)}</span><b class="no">${pad(b.n)}</b><u class="tag">${b.code}</u></div>` +
    `<div class="face cover"><div class="art"><img alt="${esc(b.title)}" decoding="async" draggable="false"><i class="hinge"></i></div></div>` +
    `</div></div>`;
}

function buildRing() {
  const N = S.list.length;
  const minM = 2 * S.R + 10;
  const rep = Math.max(1, Math.ceil(minM / N));
  S.M = N * rep; S.N = N;
  let html = '';
  for (let i = 0; i < S.M; i++) html += itemHTML(S.list[i % N], i);
  E.rail.innerHTML = html;
  S.items = Array.from(E.rail.children).map((el, i) => ({
    el, i, b: S.list[i % N], T: 0, book: el.firstChild.nextSibling, shadow: el.firstChild,
    cover: el.querySelector('.cover'), spine: el.querySelector('.spine'), art: el.querySelector('.art'), img: el.querySelector('img'), loaded: false, vis: false, hov: 0, f: -1, co: -1, z: 0, lop: -1,
  }));
  S.vis = [];
  measure();
  dirty();
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
  const M = S.M; if (!M) return;
  const p = S.pos, k = Math.floor(p), f = p - k, e = ease(f);
  const R = Math.min(S.R, Math.floor(M / 2) - 2), lo = -R, hi = R + 1, n = hi - lo + 1, i0 = -lo;
  const Wd = S.W, gap = S.gap;

  for (let o = lo; o <= hi; o++) {
    const t = o === 0 ? 1 - e : (o === 1 ? e : 0), th = (1 - t) * HALF, it = S.items[mod(k + o, M)];
    AW[o - lo] = Wd * Math.cos(th) + it.T * Math.sin(th);
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
    const i = o - lo, w = AW[i], t = AT[i], idx = mod(k + o, M), it = S.items[idx];
    const xc = cx + AL[i] + w / 2 - focus;
    if (xc + w / 2 < -60 || xc - w / 2 > S.vw + 60) continue;
    const d = Math.abs(o - f);
    const local = ent >= 1 ? 1 : clamp(ent * (1 + spread) - d * stag, 0, 1);
    if (local <= 0) continue;
    it.f = frame; nextVis.push(it);
    const isAct = (idx === mod(act, M));
    if (isAct !== it.isAct) { it.isAct = isAct; it.el.classList.toggle('is-active', isAct); }
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
  if (S.view === 'shelf' || S.view === 'boot' || S.force) {
    S.idle += dt;
    if (!drag.on && S.idle > .13 && S.view === 'shelf') {
      const r = Math.round(S.target);
      if (Math.abs(S.target - r) > .0008) S.target = r;
    }
    const k = drag.on ? 24 : 6.4;
    const diff = S.target - S.pos;
    if (Math.abs(diff) > 0.00005) { S.pos += diff * (1 - Math.exp(-dt * k)); if (Math.abs(S.target - S.pos) < 0.00008) S.pos = S.target; }
    // hover lift
    if (S.view === 'shelf' && FINE) {
      for (let j = 0; j < S.vis.length; j++) {
        const it = S.vis[j], goal = (it.i === S.hoverIdx && !drag.on && Math.abs(it.i - mod(Math.round(S.pos), S.M)) > 0 && Math.abs(S.target - S.pos) < .6) ? 1 : 0;
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
  E.nowKicker.textContent = `№ ${pad(b.n)}  ·  ${TOPIC_LABEL[b.topic]}  ·  ${TYPE_LABEL[b.type]}`;
  E.nowDate.textContent = `${fmtDate(b.date)}  ·  ${b.slides} ${b.slides === 1 ? 'slide' : 'slides'}`;
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
function goTo(idx, instant) {
  idx = mod(idx, S.M);
  const base = Math.round(S.target);
  let delta = mod(idx - base + S.M / 2, S.M) - S.M / 2;
  if (instant) { S.pos = S.target = base + delta; S.idle = 0; dirty(); return; }
  if (Math.abs(delta) > 14) { S.pos = base + delta - Math.sign(delta) * 14; }
  S.target = base + delta; S.idle = 0;
}

/* ── filters ────────────────────────────────────────────── */
function buildFilters() {
  const typeCount = t => t === 'all' ? ALL.length : ALL.filter(b => b.type === t).length;
  const types = [['all', 'All']].concat(TYPES.map(t => [t.key, t.chip]));
  E.segType.innerHTML = types.map(([k, l]) => `<button data-k="${k}" data-cursor="btn"${k === 'all' ? ' class="on"' : ''}>${l}<sup>${typeCount(k)}</sup></button>`).join('');
  const topics = TOPICS.filter(t => t.count >= (t.key === 'career' || t.key === 'other' ? 8 : 4));
  E.segTopic.innerHTML = [['all', 'Every topic', '#8f8c84']].concat(topics.map(t => [t.key, t.chip, t.dot]))
    .map(([k, l, c]) => `<button data-k="${k}" data-cursor="btn" style="--dot:${c}"${k === 'all' ? ' class="on"' : ''}><i></i>${l}</button>`).join('');
  E.segType.addEventListener('click', e => { const b = e.target.closest('button'); if (b) applyFilter({ type: b.dataset.k }); });
  E.segTopic.addEventListener('click', e => { const b = e.target.closest('button'); if (b) applyFilter({ topic: b.dataset.k }); });
}
function updateFilterUI() {
  $$('button', E.segType).forEach(b => b.classList.toggle('on', b.dataset.k === S.filter.type));
  $$('button', E.segTopic).forEach(b => b.classList.toggle('on', b.dataset.k === S.filter.topic));
}
function filtered(f) {
  return ALL.filter(b => (f.type === 'all' || b.type === f.type) && (f.topic === 'all' || b.topic === f.topic));
}
let filterBusy = false;
function applyFilter(patch, focusBook) {
  const next = Object.assign({}, S.filter, patch);
  if (next.type === S.filter.type && next.topic === S.filter.topic && !focusBook) return;
  let list = filtered(next);
  if (!list.length) { next.topic = 'all'; list = filtered(next); }
  if (!list.length) return;
  S.filter = next; updateFilterUI();
  const cur = focusBook || activeBook();
  filterBusy = true;
  gsap.killTweensOf(S, 'ent');
  gsap.to(S, {
    ent: 0, duration: dur(.32), ease: 'power2.in', onUpdate: dirty,
    onComplete() {
      S.list = list; buildRing();
      const idx = Math.max(0, list.indexOf(cur));
      S.pos = S.target = idx; S.lastAct = -1; S.nowId = '';
      const a = bookAtIdx(idx); fillNow(a); S.nowId = a.id;
      countTo(list.length);
      gsap.to(S, { ent: 1, duration: dur(1.4), ease: 'power3.out', onUpdate: dirty, onComplete() { filterBusy = false; } });
    },
  });
}
let countObj = { n: ALL.length };
function countTo(n) { gsap.to(countObj, { n, duration: dur(.9), ease: 'power3.out', snap: { n: 1 }, onUpdate() { E.metaCount.textContent = countObj.n; } }); }

/* ── input : wheel · drag · keys ────────────────────────── */
E.stage.addEventListener('wheel', e => {
  if (S.view !== 'shelf' || filterBusy) return;
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? S.vh : 1);
  const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit;
  S.target += d / (S.pitch * 1.7); S.idle = 0;
}, { passive: false });

E.stage.addEventListener('pointerdown', e => {
  if (S.view !== 'shelf' || filterBusy || e.button > 0) return;
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
    else if (idx !== a) goTo(idx);
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

E.prev.addEventListener('click', () => S.view === 'shelf' && step(-1));
E.next.addEventListener('click', () => S.view === 'shelf' && step(1));

addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) { if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); toggleSearch(); } return; }
  if (S.searchOpen) return;
  const k = e.key;
  if (S.view === 'shelf') {
    if (k === 'ArrowRight' || k === 'd') step(1);
    else if (k === 'ArrowLeft' || k === 'a') step(-1);
    else if (k === 'Home') goTo(0);
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); if (settled()) openDetail(activeBook()); }
    else if (k === '/') { e.preventDefault(); openSearch(); }
  } else if (S.view === 'detail') {
    if (k === 'Escape' || k === 'Backspace') closeDetail();
    else if (k === 'ArrowRight') stepDetail(1);
    else if (k === 'ArrowLeft') stepDetail(-1);
    else if (k === 'Enter') openReader(S.book, 0);
  } else if (S.view === 'reader') {
    if (k === 'Escape') closeReader();
    else if (k === 'ArrowRight' || k === ' ' || k === 'PageDown') { e.preventDefault(); readerStep(1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') readerStep(-1);
    else if (k === 'Home') readerGo(0);
    else if (k === 'End') readerGo(S.book.slides - 1);
  }
});

/* ── cursor ─────────────────────────────────────────────── */
let cx = -100, cy = -100, tx = -100, ty = -100, cMode = '', cHover = '';
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
    if (t.closest('.item.is-active .cover') && S.view === 'shelf') h = 'open';
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
    const cv = S.view === 'shelf' && !drag.on && e.target.closest && e.target.closest('.item.is-active .cover');
    if (cv) { const r = cv.getBoundingClientRect(); S.tilt.ty = ((e.clientX - r.left) / r.width - .5) * 9; S.tilt.tx = -((e.clientY - r.top) / r.height - .5) * 7; }
    else { S.tilt.tx = 0; S.tilt.ty = 0; }
  }, { passive: true });
  document.addEventListener('pointerleave', () => E.cursor.classList.remove('on'));
  document.addEventListener('pointerenter', () => E.cursor.classList.add('on'));
}

/* ── hash routing ───────────────────────────────────────── */
let selfHash = null;
function setHash(h) { if (location.hash === h || (h === '#/' && !location.hash)) return; selfHash = h; location.hash = h; }
addEventListener('hashchange', () => {
  if (selfHash !== null && location.hash === selfHash) { selfHash = null; return; }
  selfHash = null; route(false);
});
function parseHash() {
  const m = location.hash.match(/^#\/([\w-]+)(?:\/(read)(?:\/(\d+))?)?$/);
  if (!m) return null;
  const b = ALL.find(x => x.id === m[1]); return b ? { b, read: !!m[2], slide: +(m[3] || 0) } : null;
}
function route(initial) {
  const r = parseHash();
  if (!r) { if (S.view === 'reader') closeReader(true); if (S.view === 'detail') closeDetail(); return; }
  if (initial) {
    goTo(S.list.indexOf(r.b), true);
    fillNow(r.b); S.nowId = r.b.id;
    setTimeout(() => openDetail(r.b, { instant: true, then: r.read ? () => openReader(r.b, r.slide, true) : null }), 80);
  } else if (S.view === 'shelf') {
    const idx = S.list.indexOf(r.b); if (idx >= 0) goTo(idx, true);
    openDetail(r.b, { instant: true });
  }
}

/* ── detail ─────────────────────────────────────────────── */
function splitTitle(t) {
  return t.split(/\s+/).map(w => `<span class="w"><span>${esc(w)}</span></span>`).join(' ');
}
function fillDetail(b) {
  S.book = b;
  E.dNo.textContent = '№ ' + pad(b.n);
  E.dTopic.textContent = TOPIC_LABEL[b.topic] + '  /  ' + TYPE_LABEL[b.type];
  E.dTitle.innerHTML = splitTitle(b.title);
  E.dMeta.textContent = `${fmtDate(b.date)}  /  ${b.slides} ${b.slides === 1 ? 'slide' : 'slides'}  /  ${typeInfo(b.type).label}`;
  E.dDesc.textContent = b.desc;
  E.dBy.innerHTML = b.author ? `Written &amp; designed by <em>${esc(b.author)}</em>${b.handle ? ' &nbsp;/&nbsp; ' + esc(b.handle) : ''}` : '';
  E.dIg.style.display = b.source ? '' : 'none';
  if (b.source) { E.dIg.href = b.source; E.dIgLabel.textContent = 'View on ' + (b.sourceLabel || 'source'); }
  const show = Math.min(b.slides, 7);
  let h = `<label>Inside — ${b.slides} ${b.slides === 1 ? 'slide' : 'slides'}</label>`;
  for (let i = 0; i < show; i++) h += `<button data-i="${i}" data-cursor="btn" aria-label="Open slide ${i + 1}"><img alt="" loading="lazy" decoding="async"></button>`;
  if (b.slides > show) h += `<span class="more">+${b.slides - show}</span>`;
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

function openDetail(book, opts = {}) {
  if (S.view !== 'shelf' && S.view !== 'boot') return;
  const instant = opts.instant || REDUCE;
  S.view = 'detail'; body.classList.add('is-inside');
  setHash('#/' + book.id);
  fillDetail(book);
  E.detail.classList.add('is-open'); E.detail.setAttribute('aria-hidden', 'false');
  gsap.killTweensOf([E.dCover, E.dSheet]);
  gsap.set(E.dCover, { x: 0, y: 0, scale: 1, opacity: 1 });
  const to = E.dCover.getBoundingClientRect();
  const it = S.items[activeIdx()];
  const from = !instant && it && it.b === book && it.vis ? it.cover.getBoundingClientRect() : null;
  const { words, rv, steps } = detailEls();

  gsap.set(E.dSheet, { opacity: 0, xPercent: 5, rotate: 2.2, transformOrigin: '85% 60%' });
  gsap.set(words, { yPercent: 135 });
  gsap.set(rv, { opacity: 0, y: 20 });
  gsap.set(steps, { opacity: 0 });
  if (it) it.el.classList.add('lifted');

  const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete() { if (opts.then) opts.then(); } });
  S.tl = tl;
  tl.to(S, { ent: 0, duration: dur(.8), ease: 'power3.inOut', onUpdate: dirty }, 0)
    .to([E.filters, E.nowWrap], { opacity: 0, duration: dur(.4), ease: 'power2.out' }, 0)
    .to(E.dSheet, { opacity: 1, xPercent: 0, rotate: 0, duration: dur(1.05) }, .05);
  if (from) {
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

function closeDetail(quick) {
  if (S.view !== 'detail') return;
  S.view = 'closing';
  setHash('#/');
  if (S.tl) S.tl.kill();
  gsap.killTweensOf([E.dCover, E.dSheet, S]);
  clearTimeout(nowTimer);
  gsap.killTweensOf([E.nowTitle, E.nowKicker, E.nowDate]);
  gsap.set([E.nowTitle, E.nowKicker, E.nowDate], { y: 0, opacity: 1 });
  fillNow(S.book); S.nowId = S.book.id;
  const { words, rv, steps } = detailEls();
  const it = S.items[activeIdx()];
  const to = E.dCover.getBoundingClientRect();
  const r = it ? it.cover.getBoundingClientRect() : null;
  const tl = gsap.timeline({
    defaults: { ease: 'expo.inOut' },
    onComplete() {
      if (it) it.el.classList.remove('lifted');
      E.detail.classList.remove('is-open'); E.detail.setAttribute('aria-hidden', 'true');
      gsap.set(E.dCover, { clearProps: 'transform,opacity' });
      body.classList.remove('is-inside'); S.view = 'shelf'; S.idle = 0; dirty();
    },
  });
  tl.to(steps, { opacity: 0, duration: dur(.25), ease: 'power2.out' }, 0)
    .to(rv, { opacity: 0, y: -12, duration: dur(.4), stagger: .03, ease: 'power3.in' }, 0)
    .to(words, { yPercent: -135, duration: dur(.5), stagger: .03, ease: 'power3.in' }, 0);
  if (r) {
    const dx = r.left + r.width / 2 - (to.left + to.width / 2), dy = r.top + r.height / 2 - (to.top + to.height / 2);
    tl.to(E.dCover, { x: dx, y: dy, scale: r.width / to.width, duration: dur(1.0) }, .12);
  } else tl.to(E.dCover, { opacity: 0, y: 30, duration: dur(.5) }, .1);
  tl.to(E.dSheet, { opacity: 0, xPercent: 4, rotate: 1.6, duration: dur(.8), ease: 'power3.inOut' }, .25)
    .to([E.filters, E.nowWrap], { opacity: 1, duration: dur(.6), ease: 'power2.out' }, .5)
    .to(S, { ent: 1, duration: dur(1.3), ease: 'power3.out', onUpdate: dirty }, .38);
}

let stepBusy = false;
function stepDetail(dir) {
  if (S.view !== 'detail' || stepBusy) return;
  stepBusy = true;
  if (S.tl) S.tl.kill();
  const next = bookAtIdx(activeIdx() + dir);
  S.target = S.pos = Math.round(S.pos) + dir; S.lastAct = -1; dirty();
  const { words, rv } = detailEls();
  const tl = gsap.timeline({ onComplete() { stepBusy = false; } });
  tl.to(rv, { opacity: 0, y: -10, duration: dur(.28), stagger: .02, ease: 'power2.in' }, 0)
    .to(words, { yPercent: -135, duration: dur(.34), stagger: .02, ease: 'power3.in' }, 0)
    .to(E.dCover, { x: -70 * dir, opacity: 0, duration: dur(.4), ease: 'power3.in' }, 0)
    .add(() => {
      fillDetail(next); setHash('#/' + next.id);
      const w2 = $$('.d-title .w > span', E.dTitle), rv2 = $$('.rv', E.dText);
      gsap.set(w2, { yPercent: 135 }); gsap.set(rv2, { opacity: 0, y: 20 });
      gsap.set(E.dCover, { x: 90 * dir, opacity: 0 });
      gsap.timeline()
        .to(E.dCover, { x: 0, opacity: 1, duration: dur(1), ease: 'expo.out' }, 0)
        .to(w2, { yPercent: 0, duration: dur(1), stagger: .05, ease: 'expo.out' }, .08)
        .to(rv2, { opacity: 1, y: 0, duration: dur(.9), stagger: .06, ease: 'expo.out' }, .18);
    });
}

E.dPrev.addEventListener('click', () => stepDetail(-1));
E.dNext.addEventListener('click', () => stepDetail(1));
E.dRead.addEventListener('click', () => S.view === 'detail' && openReader(S.book, 0));
E.dCover.addEventListener('click', () => S.view === 'detail' && openReader(S.book, 0));
E.dInside.addEventListener('click', e => { const b = e.target.closest('button'); if (b && S.view === 'detail') openReader(S.book, +b.dataset.i); });

/* ── reader ─────────────────────────────────────────────── */
const chromeEls = () => [$('.brand'), $('.top-meta'), E.foot];
const RD = { i: 0, front: null, back: null, busy: false, zoom: false, qx: null, qy: null };
function slideURL(b, i) { return enc(b.dir + '/' + b.files[clamp(i, 0, b.slides - 1)]); }

function openReader(book, start, instant) {
  if (S.view !== 'detail') return;
  S.view = 'reader'; body.classList.add('in-reader');
  gsap.to(chromeEls(), { opacity: 0, duration: dur(.5), ease: 'power2.out', overwrite: true });
  setHash('#/' + book.id + '/read' + (start ? '/' + start : ''));
  RD.i = clamp(start || 0, 0, book.slides - 1); RD.busy = false; RD.zoom = false;
  RD.front = E.rA; RD.back = E.rB;
  E.rTitle.textContent = book.title; E.rTot.textContent = pad(book.slides, 2);
  E.rThumbs.innerHTML = book.files.map((f, i) => `<button data-i="${i}" data-cursor="btn" aria-label="Slide ${i + 1}"><img alt="" loading="lazy" decoding="async" src="${enc(book.dir + '/' + f)}"></button>`).join('');
  RD.front.src = slideURL(book, RD.i);
  gsap.set([E.rA, E.rB], { x: 0, y: 0, scale: 1, opacity: 0 });
  syncReader(true);
  E.reader.classList.add('is-open'); E.reader.setAttribute('aria-hidden', 'false');
  const tl = gsap.timeline();
  tl.fromTo(E.reader, { yPercent: 100 }, { yPercent: 0, duration: dur(instant ? .01 : 1.0), ease: 'expo.inOut' }, 0)
    .fromTo(RD.front, { opacity: 0, y: 60, scale: .96 }, { opacity: 1, y: 0, scale: 1, duration: dur(1.1), ease: 'expo.out' }, instant ? 0 : .45)
    .fromTo([$('.r-bar'), E.rThumbs, E.rPrev, E.rNext], { opacity: 0 }, { opacity: 1, duration: dur(.8), ease: 'power2.out', stagger: .05, clearProps: 'opacity' }, instant ? 0 : .6);
  preloadAround(book, RD.i);
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
  const h = '#/' + b.id + '/read' + (RD.i ? '/' + RD.i : ''); if (S.view === 'reader') setHash(h);
}
function preloadAround(b, i) { [i - 1, i + 1, i + 2].forEach(j => { if (j >= 0 && j < b.slides) { const im = new Image(); im.src = slideURL(b, j); } }); }
function readerStep(d) { readerGo(RD.i + d, d); }
function readerGo(i, dir) {
  const b = S.book; i = clamp(i, 0, b.slides - 1);
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
  if (S.view !== 'reader' || RD.swiped) { RD.swiped = false; return; }
  if (e.target.closest('.r-nav')) return;
  setZoom(!RD.zoom);
  if (RD.zoom) panTo(e);
});
function panTo(e) {
  const r = E.rStage.getBoundingClientRect(), im = RD.front.getBoundingClientRect();
  const nx = clamp((e.clientX - r.left) / r.width, 0, 1) - .5, ny = clamp((e.clientY - r.top) / r.height, 0, 1) - .5;
  const w = RD.front.offsetWidth, h = RD.front.offsetHeight;
  gsap.to(RD.front, { x: -nx * w * 1.1, y: -ny * h * 1.1, duration: dur(.8), ease: 'power3.out', overwrite: 'auto' });
}
E.rStage.addEventListener('pointermove', e => { if (RD.zoom && e.pointerType === 'mouse') panTo(e); });
let sw = null;
E.rStage.addEventListener('pointerdown', e => { sw = { x: e.clientX, y: e.clientY, t: performance.now() }; });
E.rStage.addEventListener('pointerup', e => {
  if (!sw || RD.zoom) { sw = null; return; }
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.3) { RD.swiped = true; readerStep(dx < 0 ? 1 : -1); }
  sw = null;
});
E.rStage.addEventListener('wheel', e => {
  if (S.view !== 'reader' || RD.zoom) return;
  e.preventDefault();
  const now = performance.now(); if (now - (RD.wheelT || 0) < 520) return;
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(d) > 12) { RD.wheelT = now; readerStep(d > 0 ? 1 : -1); }
}, { passive: false });
E.rPrev.addEventListener('click', () => readerStep(-1));
E.rNext.addEventListener('click', () => readerStep(1));
E.rThumbs.addEventListener('click', e => { const b = e.target.closest('button'); if (b) readerGo(+b.dataset.i); });
E.rClose.addEventListener('click', () => closeReader());
function closeReader(silent) {
  if (S.view !== 'reader') return;
  S.view = 'detail'; body.classList.remove('in-reader');
  gsap.to(chromeEls(), { opacity: 1, duration: dur(.7), ease: 'power2.out', overwrite: true, delay: .25, clearProps: 'opacity' });
  if (RD.zoom) setZoom(false, true);
  if (!silent) setHash('#/' + S.book.id);
  gsap.timeline({ onComplete() { E.reader.classList.remove('is-open'); E.reader.setAttribute('aria-hidden', 'true'); } })
    .to(E.reader, { yPercent: 100, duration: dur(.9), ease: 'expo.inOut' });
}

/* ── round button (search ⇄ back) ───────────────────────── */
E.round.addEventListener('click', () => {
  if (S.view === 'reader') closeReader();
  else if (S.view === 'detail') closeDetail();
  else if (S.view === 'shelf') toggleSearch();
});

/* ── search ─────────────────────────────────────────────── */
const SIDX = ALL.map(b => ({ b, hay: [b.title, b.short, TOPIC_LABEL[b.topic], TYPE_LABEL[b.type], b.author, b.handle, b.tags.join(' '), b.date.slice(0, 4), 'no ' + b.n].join(' ').toLowerCase() }));
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
    `<li data-i="${i}" class="${i === 0 ? 'on' : ''}"><span class="th" style="background-image:url(${enc(b.thumb)})"></span><span><div class="tt">${esc(b.title)}</div><div class="mm">${TOPIC_LABEL[b.topic]} · ${TYPE_LABEL[b.type]} · ${b.slides} ${b.slides === 1 ? 'slide' : 'slides'} · ${fmtDate(b.date)}</div></span><span class="no">№ ${pad(b.n)}</span></li>`).join('')
    : `<li class="none">Nothing on the shelf matches “${esc(q)}”.</li>`;
}
function markSel() {
  $$('li', E.sList).forEach((li, i) => li.classList.toggle('on', i === sSel));
  const on = $('li.on', E.sList); if (on) on.scrollIntoView({ block: 'nearest' });
}
function openSearch() {
  if (S.searchOpen || S.view !== 'shelf') return;
  S.searchOpen = true; E.search.classList.add('is-open'); E.search.setAttribute('aria-hidden', 'false');
  E.sInput.value = ''; renderSearch('');
  gsap.fromTo(E.sVeil, { opacity: 0 }, { opacity: 1, duration: dur(.5), ease: 'power2.out' });
  gsap.fromTo(E.sBox, { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: dur(.8), ease: 'expo.out' });
  gsap.fromTo($$('li', E.sList), { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: dur(.7), stagger: .035, ease: 'expo.out', delay: .12 });
  setTimeout(() => E.sInput.focus(), 60);
}
function closeSearch() {
  if (!S.searchOpen) return;
  S.searchOpen = false; E.sInput.blur();
  gsap.timeline({ onComplete() { E.search.classList.remove('is-open'); E.search.setAttribute('aria-hidden', 'true'); } })
    .to(E.sBox, { y: 14, opacity: 0, duration: dur(.3), ease: 'power2.in' }, 0)
    .to(E.sVeil, { opacity: 0, duration: dur(.4), ease: 'power2.out' }, .05);
}
function toggleSearch() { S.searchOpen ? closeSearch() : openSearch(); }
function pickBook(b) {
  closeSearch();
  let idx = S.list.indexOf(b);
  if (idx < 0) { applyFilter({ type: 'all', topic: 'all' }, b); return; }
  goTo(idx);
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

/* ── resize ─────────────────────────────────────────────── */
let rzT = 0;
addEventListener('resize', () => {
  clearTimeout(rzT);
  rzT = setTimeout(() => {
    const oldR = S.R; measure();
    if (S.M < 2 * S.R + 10 || S.R !== oldR && S.M > 4 * S.R + 40) { const p = S.pos; buildRing(); S.pos = S.target = Math.round(p); }
    dirty();
  }, 90);
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
  const first = S.list[0]; fillNow(first); S.nowId = first.id; E.metaCount.textContent = ALL.length;
  render();
  requestAnimationFrame(tick);

  // preload the first covers so the opening frame is never empty
  const warm = S.items.slice(0, 9).concat(S.items.slice(-2)).map(it => { ensureImg(it); return it.img.decode ? it.img.decode().catch(() => {}) : Promise.resolve(); });
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([Promise.all([fonts, Promise.all(warm)]), new Promise(r => setTimeout(r, 1800))]).then(intro);
}
function intro() {
  root.classList.remove('is-loading');
  S.view = 'shelf';
  const tl = gsap.timeline();
  gsap.set([E.top, E.filters, E.nowWrap, E.foot], { opacity: 1 });
  tl.fromTo('.top > *', { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: dur(1.1), stagger: .09, ease: 'expo.out', clearProps: 'opacity,transform' }, 0)
    .from(E.filters, { y: -10, opacity: 0, duration: dur(1.1), ease: 'expo.out' }, .15)
    .from([E.nowTitle, E.nowKicker, E.nowDate], { y: 18, opacity: 0, duration: dur(1.2), stagger: .07, ease: 'expo.out' }, .75)
    .fromTo([E.prev, E.next, E.foot], { opacity: 0 }, { opacity: 1, duration: dur(1.1), ease: 'power2.out', clearProps: 'opacity' }, 1);
  S.pos = REDUCE ? 0 : 5.2; S.target = 0;
  gsap.to(S, { ent: 1, duration: dur(2.1), ease: 'power3.out', onUpdate: dirty });
  dirty();
  if (parseHash()) route(true);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

// tiny debug handle
window.__lib = { S, goTo, step, openDetail, closeDetail, openReader, closeReader, applyFilter };
})();
