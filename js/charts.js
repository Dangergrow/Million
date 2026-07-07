/* =========================================================
   charts.js — графики (Chart.js) с защитой от отсутствия canvas
   ========================================================= */
'use strict';

let charts = { savings: null, flow: null, net: null, pie: null, period: null };

function ct(){ return getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#94a1c2'; }
function cg(){ return getComputedStyle(document.body).getPropertyValue('--stroke').trim() || 'rgba(255,255,255,.09)'; }
function destroyCharts(){ for (const k in charts){ if (charts[k]){ charts[k].destroy(); charts[k] = null; } } }

function baseOpts(){
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { usePointStyle: true, boxWidth: 8, padding: 14, font: { size: 11 }, color: ct() } },
      tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmt(c.parsed.y != null ? c.parsed.y : c.parsed) } }
    },
    scales: {
      x: { grid: { color: cg() }, ticks: { color: ct(), maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
      y: { grid: { color: cg() }, ticks: { color: ct(), callback: v => fmtShort(v) } }
    }
  };
}

function newChart(id, cfg){
  const el = $('#' + id); if (!el) return null;
  return new Chart(el, cfg);
}

function renderMainCharts(p, a){
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = ct();
  Chart.defaults.font.family = "'Inter',sans-serif";
  const labels = a.rows.map(r => monthLabel(r.key));
  const traj = goalTrajectoryInfo(p);
  const bo = baseOpts();

  if ($('#chartSavings') && a.rows.length){
    charts.savings = newChart('chartSavings', { type: 'line',
      data: { labels, datasets: [
        { label: 'Накоплено', data: a.rows.map(r => r.cumulative), borderColor: '#ffcf5c', backgroundColor: 'rgba(255,207,92,.09)', fill: true, tension: .35, borderWidth: 2.8, pointRadius: 0, pointHoverRadius: 5 },
        ...(traj ? [{ label: 'Нужно по плану', data: a.rows.map(r => requiredAt(p, traj, r.key)), borderColor: '#6d5cff', borderDash: [7, 5], fill: false, borderWidth: 2, pointRadius: 0 }] : [])
      ] }, options: bo });
  }
  if ($('#chartFlow') && a.rows.length){
    charts.flow = newChart('chartFlow', { type: 'bar',
      data: { labels, datasets: [
        { label: 'Доходы', data: a.rows.map(r => r.income), backgroundColor: 'rgba(47,230,168,.85)', borderRadius: 6, borderSkipped: false },
        { label: 'Расходы', data: a.rows.map(r => r.expense), backgroundColor: 'rgba(255,94,121,.85)', borderRadius: 6, borderSkipped: false }
      ] }, options: bo });
  }
  if ($('#chartNet') && a.rows.length){
    charts.net = newChart('chartNet', { type: 'bar',
      data: { labels, datasets: [{ label: 'Чистые накопления', data: a.rows.map(r => r.net),
        backgroundColor: a.rows.map(r => r.net >= 0 ? 'rgba(109,92,255,.85)' : 'rgba(255,94,121,.85)'), borderRadius: 6, borderSkipped: false }] }, options: bo });
  }
  renderPie(p, a);
}

function renderPie(p, a){
  if (!$('#chartPie')) return;
  const modeEl = $('#pieMode');
  const mode = modeEl && modeEl.value === 'income' ? 'income' : 'expense';
  const cats = p.categories[mode] || [];
  const { window } = periodWindow(p, a, settings().statPeriod);
  const inPeriod = window.length ? window.map(r => p.months.find(m => m.key === r.key)).filter(Boolean) : p.months;
  const totals = cats.map(c => {
    let s = 0; inPeriod.forEach(m => { s += Number((mode === 'income' ? m.incomes : m.expenses)[c.id]) || 0; });
    return { name: c.name, color: c.color, val: s };
  }).filter(x => x.val > 0).sort((x, y) => y.val - x.val);

  const legend = $('#pieLegend');
  if (charts.pie){ charts.pie.destroy(); charts.pie = null; }
  if (!totals.length){ if (legend) legend.innerHTML = '<span class="mini">Нет данных за период</span>'; return; }
  const total = totals.reduce((s, t) => s + t.val, 0);
  charts.pie = newChart('chartPie', { type: 'doughnut',
    data: { labels: totals.map(t => t.name), datasets: [{ data: totals.map(t => t.val), backgroundColor: totals.map(t => t.color), borderWidth: 3, borderColor: 'rgba(8,11,22,.7)' }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '66%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.label + ': ' + fmt(c.parsed) + ' (' + pct(c.parsed / total * 100) + ')' } } } } });
  if (legend) legend.innerHTML = totals.map(t => `<div class="li"><span class="d" style="background:${t.color}"></span>${escapeHtml(t.name)} — <b>${pct(t.val / total * 100)}</b></div>`).join('');
}

function renderFlowChart(p, a){
  if (!$('#chartFlow') || !a.rows.length) return;
  if (charts.flow){ charts.flow.destroy(); charts.flow = null; }
  charts.flow = newChart('chartFlow', { type: 'bar',
    data: { labels: a.rows.map(r => monthLabel(r.key)), datasets: [
      { label: 'Доходы', data: a.rows.map(r => r.income), backgroundColor: 'rgba(47,230,168,.85)', borderRadius: 6 },
      { label: 'Расходы', data: a.rows.map(r => r.expense), backgroundColor: 'rgba(255,94,121,.85)', borderRadius: 6 }
    ] }, options: baseOpts() });
}

function renderPeriodBar(p, a){
  if (!$('#chartPeriodBars')) return;
  if (charts.period){ charts.period.destroy(); charts.period = null; }
  const { window } = periodWindow(p, a, settings().statPeriod);
  if (!window.length) return;
  charts.period = newChart('chartPeriodBars', { type: 'bar',
    data: { labels: window.map(r => monthLabel(r.key)), datasets: [{ label: 'Накоплено', data: window.map(r => r.net),
      backgroundColor: window.map(r => r.net >= 0 ? 'rgba(109,92,255,.85)' : 'rgba(255,94,121,.85)'), borderRadius: 6, borderSkipped: false }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => 'Накоплено: ' + fmt(c.parsed.y) } } },
      scales: { x: { grid: { display: false }, ticks: { color: ct(), maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } }, y: { grid: { color: cg() }, ticks: { color: ct(), callback: v => fmtShort(v) } } } } });
}
