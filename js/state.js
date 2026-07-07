/* =========================================================
   state.js — модель данных, хранилище, профили
   ========================================================= */
'use strict';

const STORE_KEY = 'millionaire_os_v2';
const STORE_VER = 2;

let state = null;

function defaultCategories(){
  return {
    income: [
      { id: uid(), name: 'Зарплата',       color: PALETTE[0], scope: 'permanent' },
      { id: uid(), name: 'Подработка',      color: PALETTE[4], scope: 'permanent' },
      { id: uid(), name: 'Инвестиции',      color: PALETTE[2], scope: 'permanent' },
      { id: uid(), name: 'Прочие доходы',   color: PALETTE[7], scope: 'permanent' },
    ],
    expense: [
      { id: uid(), name: 'Продукты',        color: PALETTE[3], scope: 'permanent', dailyNorm: 800 },
      { id: uid(), name: 'Транспорт',       color: PALETTE[1], scope: 'permanent', dailyNorm: 200 },
      { id: uid(), name: 'Аренда',          color: PALETTE[6], scope: 'permanent' },
      { id: uid(), name: 'Развлечения',     color: PALETTE[10], scope: 'permanent', dailyNorm: 300 },
      { id: uid(), name: 'Здоровье',        color: PALETTE[8], scope: 'permanent' },
      { id: uid(), name: 'Прочие расходы',  color: PALETTE[11], scope: 'permanent' },
    ]
  };
}

function newProfile(name){
  const start = nowKey();
  return {
    id: uid(), name: name || 'Мой план', startBalance: 0, startMonth: start,
    categories: defaultCategories(),
    goals: [{
      id: uid(), name: 'Первый миллион', amount: 1000000,
      mode: 'months', months: 60, endDate: addMonths(start, 59),
      useSafe: true, safeByMonth: {}, createdAt: Date.now()
    }],
    months: [], collapsed: {}
  };
}

function defaultState(){
  const p = newProfile('Мой план');
  return { ver: STORE_VER, activeId: p.id, profiles: [p], settings: { lockFuture: true, statPeriod: 12 } };
}

function migrate(d){
  d.ver = STORE_VER;
  d.settings = d.settings || {};
  if (d.settings.lockFuture === undefined) d.settings.lockFuture = true;
  if (!d.settings.statPeriod) d.settings.statPeriod = 12;
  (d.profiles || []).forEach(p => {
    p.collapsed = p.collapsed || {};
    p.months = p.months || [];
    p.goals = p.goals || [];
    p.goals.forEach(g => { g.useSafe = !!g.useSafe; g.safeByMonth = g.safeByMonth || {}; });
    if (!p.categories) p.categories = defaultCategories();
    ['income', 'expense'].forEach(t => (p.categories[t] || []).forEach(c => { if (!c.scope) c.scope = 'permanent'; }));
    p.months.forEach(m => { m.incomes = m.incomes || {}; m.expenses = m.expenses || {}; });
  });
  if (!d.profiles.find(p => p.id === d.activeId)) d.activeId = d.profiles[0].id;
  return d;
}

function loadState(){
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const d = JSON.parse(raw); if (d && d.profiles && d.profiles.length) return migrate(d); }
  } catch (e) { console.warn('load error', e); }
  return defaultState();
}

const saveState = debounce(() => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Не удалось сохранить: ' + e.message, 'err'); }
}, 250);
function saveNow(){ try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }

function P(){ return state.profiles.find(p => p.id === state.activeId); }
function settings(){
  const s = state.settings || (state.settings = {});
  if (s.lockFuture === undefined) s.lockFuture = true;
  if (!s.statPeriod) s.statPeriod = 12;
  return s;
}
function isLocked(key){ return !!settings().lockFuture && key > nowKey(); }
/* Категории, действующие в конкретном месяце (постоянные + временные этого месяца) */
function catsFor(p, type, monthKey){
  return p.categories[type].filter(c => c.scope !== 'temporary' || c.month === monthKey);
}
