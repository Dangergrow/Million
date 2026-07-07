/* =========================================================
   ui.js — примитивы интерфейса, эффекты (безопасные)
   ========================================================= */
'use strict';

/* ---------- Тосты ---------- */
function toast(msg, type = ''){
  const box = $('#toasts'); if (!box) return;
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  const ic = { ok: '✅', err: '⛔', warn: '⚠️' }[type] || 'ℹ️';
  t.innerHTML = `<span>${ic}</span><span>${msg}</span>`;
  box.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(60px)'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 300); }, 3200);
}

/* ---------- Модалка ---------- */
function openModal(html, wide){
  const m = $('#modal'); if (!m) return;
  m.className = 'modal' + (wide ? ' wide' : '');
  m.innerHTML = html;
  $('#overlay').classList.add('show');
}
function closeModal(){ const o = $('#overlay'); if (o) o.classList.remove('show'); }

function confirmAction({ title, msg, onOk, danger, confirmText = 'Подтвердить', requireCheck, checkLabel }){
  openModal(`
    <h3>${title}</h3><p class="msub">${msg}</p>
    ${requireCheck ? `<label class="check-danger"><input type="checkbox" id="cfCheck"><span>${checkLabel}</span></label>` : ''}
    <div class="actions">
      <button class="btn ghost" data-close>Отмена</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" id="cfOk" ${requireCheck ? 'disabled' : ''}>${confirmText}</button>
    </div>`);
  if (requireCheck) $('#cfCheck').addEventListener('change', e => { $('#cfOk').disabled = !e.target.checked; });
  $('#cfOk').addEventListener('click', () => { closeModal(); onOk && onOk(); });
}

/* ---------- helpers для рендера ---------- */
function emptyState(ic, title, sub, action){
  const btn = action ? `<button class="btn primary" style="margin-top:16px" data-act="empty-action" data-empty="${action.act}">${action.label}</button>` : '';
  return `<div class="empty"><div class="em-ic">${ic}</div><h3>${title}</h3><p>${sub}</p>${btn}</div>`;
}
function ringHtml(prog, label){
  const r = 57, circ = 2 * Math.PI * r, off = circ * (1 - Math.min(1, (prog || 0) / 100));
  return `<div class="ring">
    <svg width="130" height="130" viewBox="0 0 130 130">
      <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#37e0ff"/><stop offset="1" stop-color="#6d5cff"/></linearGradient></defs>
      <circle class="rc" cx="65" cy="65" r="${r}"/>
      <circle class="rp" cx="65" cy="65" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="${off}"/>
    </svg>
    <div class="rt"><div><b>${pct(prog)}</b><span>${label || ''}</span></div></div>
  </div>`;
}
function kpiHtml(label, val, delta, accent, ic, dCls){
  return `<div class="card kpi tilt a-${accent || 'neon'}">
    <div class="kic">${ic || ''}</div>
    <div class="klab">${label}</div>
    <div class="kval ${String(val).length > 12 ? 'sm' : ''}">${val}</div>
    ${delta ? `<div class="kdelta ${dCls || ''}">${delta}</div>` : ''}
  </div>`;
}
function recHtml([cls, ic, t, s]){
  return `<div class="rec ${cls}"><div class="ic">${ic}</div><div><div class="t">${t}</div><div class="s">${s}</div></div></div>`;
}
function animateIn(sel){
  if (typeof gsap === 'undefined') return;
  const els = $$(sel); if (!els.length) return;
  gsap.fromTo(els, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: .5, stagger: .05, ease: 'power3.out', clearProps: 'transform,opacity' });
}

/* ---------- Лёгкие частицы (без O(n²) линий) ---------- */
(function particles(){
  const c = $('#bgCanvas'); if (!c) return;
  const ctx = c.getContext('2d');
  let w, h, dots = [];
  function resize(){ w = c.width = innerWidth; h = c.height = innerHeight; }
  resize(); addEventListener('resize', resize);
  const N = Math.min(46, Math.floor(innerWidth / 34));
  for (let i = 0; i < N; i++) dots.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .18, r: Math.random() * 1.8 + .6, a: Math.random() * .4 + .15 });
  function frame(){
    ctx.clearRect(0, 0, w, h);
    for (const d of dots){
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0 || d.x > w) d.vx *= -1;
      if (d.y < 0 || d.y > h) d.vy *= -1;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.283);
      ctx.fillStyle = `rgba(150,180,255,${d.a})`; ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  frame();
})();

/* ---------- 3D tilt — только под курсором, через rAF ---------- */
(function tilt(){
  let raf = null, pending = null;
  document.addEventListener('pointermove', e => {
    const card = e.target && e.target.closest ? e.target.closest('.tilt') : null;
    if (!card) return;
    const r = card.getBoundingClientRect();
    pending = { card, dx: (e.clientX - (r.left + r.width / 2)) / r.width, dy: (e.clientY - (r.top + r.height / 2)) / r.height };
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      if (!pending) return;
      pending.card.style.transform = `perspective(1000px) rotateY(${pending.dx * 4.5}deg) rotateX(${-pending.dy * 4.5}deg)`;
    });
  }, { passive: true });
  document.addEventListener('pointerout', e => {
    const card = e.target && e.target.closest ? e.target.closest('.tilt') : null;
    if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
  }, { passive: true });
})();
