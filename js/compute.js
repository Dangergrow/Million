/* =========================================================
   compute.js — вся аналитика: накопления, Сейф, нормы, статусы
   ========================================================= */
'use strict';

/* ---- базовые ряды по месяцам ---- */
function computeRows(p){
  const rows = []; let cum = Number(p.startBalance) || 0;
  const sorted = [...p.months].sort((a, b) => a.key < b.key ? -1 : 1);
  sorted.forEach(m => {
    const inc = sumObj(m.incomes), exp = sumObj(m.expenses), net = inc - exp;
    cum += net;
    rows.push({ key: m.key, income: inc, expense: exp, net, cumulative: cum });
  });
  return rows;
}

function totalGoal(p){ return p.goals.reduce((s, g) => s + (Number(g.amount) || 0), 0); }
function goalMonthsCount(p, g){
  if (g.mode === 'date' && g.endDate) return Math.max(1, monthDiff(p.startMonth, g.endDate) + 1);
  return Math.max(1, Number(g.months) || 1);
}
function goalEndKey(p, g){
  if (g.mode === 'date' && g.endDate) return g.endDate;
  return addMonths(p.startMonth, goalMonthsCount(p, g) - 1);
}

/* ---- Сейф ---- */
function goalSafeBalance(g){ return g && g.safeByMonth ? sumObj(g.safeByMonth) : 0; }
function overallSafeBalance(p){ return p.goals.filter(g => g.useSafe).reduce((s, g) => s + goalSafeBalance(g), 0); }
function safePace(g){
  const vals = Object.values(g.safeByMonth || {}).filter(v => Number(v) > 0);
  return vals.length ? vals.reduce((s, v) => s + Number(v), 0) / vals.length : 0;
}

/* ---- общая аналитика профиля ----
   savedNow  — всего накоплено по плану на текущий момент
   safeTotal — сколько лежит во всех Сейфах
   handNow   — деньги «на руках» = savedNow − safeTotal
*/
function analyze(p){
  const rows = computeRows(p);
  const start = Number(p.startBalance) || 0;
  const nk = nowKey();
  let savedNow = start, finalCum = start;
  if (rows.length){
    finalCum = rows[rows.length - 1].cumulative;
    const past = rows.filter(r => r.key <= nk);
    savedNow = past.length ? past[past.length - 1].cumulative : start;
  }
  const totalIncome = rows.reduce((s, r) => s + r.income, 0);
  const totalExpense = rows.reduce((s, r) => s + r.expense, 0);
  const totalNet = totalIncome - totalExpense;
  const avgNet = rows.length ? totalNet / rows.length : 0;
  const savingsRate = totalIncome > 0 ? (totalNet / totalIncome * 100) : 0;
  let bestMonth = null; rows.forEach(r => { if (!bestMonth || r.net > bestMonth.net) bestMonth = r; });
  const tg = totalGoal(p);
  const safeTotal = overallSafeBalance(p);
  return {
    rows, start, savedNow, finalCum, totalIncome, totalExpense, totalNet, avgNet,
    savingsRate, bestMonth, totalGoal: tg, nowKey: nk,
    safeTotal, handNow: savedNow - safeTotal, handFinal: finalCum - safeTotal
  };
}

/* ---- эталонная траектория к целям ---- */
function goalTrajectoryInfo(p){
  const goals = p.goals.filter(g => Number(g.amount) > 0);
  if (!goals.length) return null;
  const targetAmount = goals.reduce((s, g) => s + Number(g.amount), 0);
  let deadlineKey = goalEndKey(p, goals[0]);
  goals.forEach(g => { const k = goalEndKey(p, g); if (k > deadlineKey) deadlineKey = k; });
  const totalMonths = Math.max(1, monthDiff(p.startMonth, deadlineKey) + 1);
  return { targetAmount, deadlineKey, totalMonths, start: Number(p.startBalance) || 0 };
}
function requiredAt(p, traj, key){
  const elapsed = monthDiff(p.startMonth, key) + 1;
  const frac = Math.max(0, Math.min(1, elapsed / traj.totalMonths));
  return traj.start + (traj.targetAmount - traj.start) * frac;
}

/* ---- статусы месяцев (цвет) ---- */
function computeStatuses(p, rows){
  const traj = goalTrajectoryInfo(p);
  const map = {};
  if (traj){
    const tol = Math.max(traj.targetAmount * 0.015, 1000);
    rows.forEach(r => {
      const req = requiredAt(p, traj, r.key);
      const diff = r.cumulative - req;
      const status = diff > tol ? 'ahead' : diff < -tol ? 'behind' : 'ontrack';
      map[r.key] = { status, required: req, diff };
    });
    return { mode: 'goal', traj, map };
  }
  rows.forEach(r => {
    const status = r.net > 0 ? 'ahead' : r.net < 0 ? 'behind' : 'neutral';
    map[r.key] = { status, required: null, diff: null };
  });
  return { mode: 'net', traj: null, map };
}
const STATUS_META = {
  ahead:   { label: 'Опережение', ic: '▲' },
  behind:  { label: 'Отставание', ic: '▼' },
  ontrack: { label: 'В графике',  ic: '●' },
  neutral: { label: '—',          ic: '○' }
};
const NET_META = {
  ahead:   { label: 'Профицит', ic: '▲' },
  behind:  { label: 'Дефицит',  ic: '▼' },
  ontrack: { label: 'В ноль',   ic: '●' },
  neutral: { label: 'В ноль',   ic: '●' }
};
function statusMeta(mode, st){ return (mode === 'net' ? NET_META : STATUS_META)[st] || STATUS_META.neutral; }
function statusTitle(mode, info){
  if (mode === 'net') return info.status === 'ahead' ? 'Доходы больше расходов' : info.status === 'behind' ? 'Расходы больше доходов' : 'Доходы равны расходам';
  if (info.diff == null) return '';
  return info.status === 'behind' ? 'Отставание от плана на ' + fmt(-info.diff)
       : info.status === 'ahead'  ? 'Опережение плана на ' + fmt(info.diff)
       : 'Накопления идут точно по графику цели';
}
function badgeFor(mode, info){
  const m = statusMeta(mode, info.status), title = statusTitle(mode, info);
  return `<span class="badge ${info.status}"${title ? ` title="${escapeHtml(title)}"` : ''}><span>${m.ic}</span>${m.label}</span>`;
}

/* ---- нормы расходов ---- */
function catNormPlan(c, key){ return Number(c.dailyNorm) > 0 ? c.dailyNorm * daysInMonth(key) : null; }
function normStatusFor(c, m){
  const plan = catNormPlan(c, m.key); if (plan == null) return null;
  const actual = Number(m.expenses[c.id]) || 0;
  const diff = actual - plan;
  return { plan, actual, diff, state: actual <= 0 ? 'empty' : diff > 0 ? 'over' : 'under' };
}
function computeNormControl(p){
  const perCat = []; let totalDiff = 0, controlled = 0;
  p.categories.expense.forEach(c => {
    if (!(Number(c.dailyNorm) > 0)) return;
    controlled++;
    let plannedSum = 0, actualSum = 0, monthsCount = 0;
    p.months.forEach(m => {
      const actual = Number(m.expenses[c.id]) || 0; if (actual <= 0) return;
      plannedSum += c.dailyNorm * daysInMonth(m.key); actualSum += actual; monthsCount++;
    });
    if (!monthsCount) return;
    const diff = actualSum - plannedSum; totalDiff += diff;
    perCat.push({ id: c.id, name: c.name, color: c.color, diff, plannedSum, actualSum, monthsCount });
  });
  perCat.sort((a, b) => b.diff - a.diff);
  return { perCat, totalDiff, controlled };
}

/* ---- статистика за период ---- */
function periodWindow(p, a, N){
  const rows = a.rows; if (!rows.length) return { window: [], prev: [] };
  const nk = a.nowKey;
  let refIdx = -1; rows.forEach((r, i) => { if (r.key <= nk) refIdx = i; });
  if (refIdx < 0) refIdx = rows.length - 1;
  const end = refIdx + 1, start = Math.max(0, end - N);
  const window = rows.slice(start, end);
  const prevEnd = start, prevStart = Math.max(0, prevEnd - N);
  const prev = rows.slice(prevStart, prevEnd);
  return { window, prev };
}
function sumRows(rows){ return rows.reduce((o, r) => { o.income += r.income; o.expense += r.expense; o.net += r.net; return o; }, { income: 0, expense: 0, net: 0 }); }
