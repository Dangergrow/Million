/* =========================================================
   utils.js — общие вспомогательные функции
   ========================================================= */
'use strict';

const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const MONTHS_FULL = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const PALETTE = ['#6d5cff','#37e0ff','#2fe6a8','#ff5e79','#ff5cf0','#ffcf5c','#ffb547','#a78bfa','#22d3ee','#f472b6','#84cc16','#fb923c'];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function fmt(n){ n = Math.round(Number(n) || 0); return n.toLocaleString('ru-RU') + ' ₽'; }
function fmtShort(n){
  n = Number(n) || 0; const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн';
  if (a >= 1e3) return Math.round(n / 1e3) + ' тыс';
  return Math.round(n).toString();
}
function pct(n){ return (Math.round((Number(n) || 0) * 10) / 10).toLocaleString('ru-RU') + '%'; }

function nowKey(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function monthLabel(key, full = false){
  if (!key) return '';
  const [y, m] = key.split('-').map(Number);
  return (full ? MONTHS_FULL[m - 1] : MONTHS_SHORT[m - 1]) + ' ' + y;
}
function addMonths(key, n){
  let [y, m] = key.split('-').map(Number);
  m = m - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + '-' + String(m + 1).padStart(2, '0');
}
function monthDiff(a, b){
  const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}
function daysInMonth(key){ const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); }

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function clampNum(v, min, max){ v = Number(v); if (isNaN(v)) v = min; return Math.max(min, Math.min(max, v)); }
function sumObj(o){ let s = 0; for (const k in o) s += Number(o[k]) || 0; return s; }
function debounce(fn, ms){ let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
