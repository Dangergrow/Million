/* =========================================================
   views.js — рендер всех экранов (без inline-обработчиков)
   Вся интерактивность — через data-act (делегирование в app.js)
   ========================================================= */
'use strict';

const VIEW_TITLES = { dashboard: 'Дашборд', goals: 'Цели и Сейфы', plan: 'Динамический план', stats: 'Статистика', categories: 'Категории', settings: 'Настройки' };
let currentView = 'dashboard';

/* «Накоплено» для конкретной цели: Сейф → баланс сейфа, иначе — деньги на руках */
function goalSaved(g, a){ return g.useSafe ? goalSafeBalance(g) : a.handNow; }

function renderProfiles(){
  const sel = $('#profileSelect'); if (!sel) return;
  sel.innerHTML = state.profiles.map(p => `<option value="${p.id}"${p.id === state.activeId ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
}
function renderView(name){
  currentView = name;
  destroyCharts();
  const title = $('#viewTitle'); if (title) title.textContent = VIEW_TITLES[name] || '';
  const map = { dashboard: renderDashboard, goals: renderGoals, plan: renderPlan, stats: renderStats, categories: renderCategories, settings: renderSettings };
  (map[name] || renderDashboard)();
  animateIn('#view .card');
}
function renderAll(){ renderProfiles(); renderView(currentView); }

/* =========================================================
   DASHBOARD
   ========================================================= */
function renderDashboard(){
  const p = P(), a = analyze(p), tg = a.totalGoal, nk = nowKey();
  const safeGoals = p.goals.filter(g => g.useSafe && Number(g.amount) > 0);
  let achieved = 0;
  p.goals.forEach(g => { const amt = Number(g.amount) || 0; achieved += Math.min(goalSaved(g, a), amt); });
  const ringProg = tg > 0 ? Math.min(100, achieved / tg * 100) : 0;
  const inPlan = p.months.some(m => m.key === nk);

  $('#view').innerHTML = `
  <div class="grid g12">
    ${kpiHtml('Накоплено на руках', fmt(a.handNow), safeGoals.length ? 'свободные деньги (без Сейфов)' : (tg > 0 ? 'по плану' : ''), 'green', '💵', 'pos')}
    ${kpiHtml('В Сейфах (всего)', fmt(a.safeTotal), safeGoals.length ? `${safeGoals.length} цел. с Сейфом` : 'Сейфы не заданы', 'cyan', '🔒', 'cyan')}
    ${kpiHtml('Прогноз к концу плана', fmt(a.finalCum), tg > 0 ? (a.finalCum >= tg ? '✓ цели по силам' : '⚠ не хватит на всё') : '', 'gold', '📈', a.finalCum >= tg ? 'pos' : 'warn')}
    ${kpiHtml('Средние сбережения', fmt(a.avgNet) + '/мес', `норма ${pct(a.savingsRate)}`, 'neon', '⚡', a.avgNet >= 0 ? 'pos' : 'neg')}

    <div class="card c8">
      <div class="section-head"><h2>Быстрый ввод</h2></div>
      <div class="ovq">
        <div class="ql">Внести операцию<small>${inPlan ? 'в текущий месяц — ' + monthLabel(nk, true) : 'текущий месяц вне плана — постройте план'}</small></div>
        <div class="spacer" style="flex:1"></div>
        <button class="btn qa inc" data-act="tb-income" ${inPlan ? '' : 'disabled'}>＋ Доход</button>
        <button class="btn qa exp" data-act="tb-expense" ${inPlan ? '' : 'disabled'}>＋ Расход</button>
      </div>
    </div>
    <div class="card c4 tilt" style="display:flex;align-items:center;justify-content:center">
      <div class="ring-wrap">
        ${ringHtml(ringProg, 'к целям')}
        <div><div class="mini">Общий прогресс</div><div style="font-family:var(--disp);font-size:19px;font-weight:800">${fmt(Math.round(tg * ringProg / 100))}</div><div class="mini">из ${fmt(tg)}</div></div>
      </div>
    </div>

    <div class="card c7">
      <div class="section-head"><div><h2>Прогресс по целям</h2><p class="sub" style="margin:2px 0 0">Сейф — под цель, «на руках» — свободные деньги</p></div></div>
      <div>${dashGoalsHtml(p, a)}</div>
    </div>
    <div class="card c5">
      <div class="section-head"><h2>Состояние Сейфов</h2></div>
      <div>${safeOverviewHtml(p, a)}</div>
    </div>

    <div class="card c5">
      <div class="section-head"><h2>Контроль норм</h2></div>
      <div>${normControlHtml(p)}</div>
    </div>
    <div class="card c7">
      <div class="section-head"><h2>Рекомендации</h2></div>
      <div>${recsHtml(p, a)}</div>
    </div>

    <div class="card c8"><h3>Накопления по месяцам</h3><div class="chart-wrap tall"><canvas id="chartSavings"></canvas></div></div>
    <div class="card c4">
      <div class="section-head"><h3 style="margin:0">Структура</h3>
        <select class="fld" id="pieMode" style="width:auto"><option value="expense">Расходы</option><option value="income">Доходы</option></select></div>
      <div class="chart-wrap pie"><canvas id="chartPie"></canvas></div><div class="legend" id="pieLegend"></div>
    </div>
    <div class="card c6"><h3>Доходы и расходы</h3><div class="chart-wrap"><canvas id="chartFlow"></canvas></div></div>
    <div class="card c6"><h3>Чистые накопления</h3><div class="chart-wrap"><canvas id="chartNet"></canvas></div></div>
  </div>`;
  renderMainCharts(p, a);
}

function dashGoalsHtml(p, a){
  if (!p.goals.length) return emptyState('◎', 'Целей пока нет', 'Поставьте цель и включите Сейф, чтобы копить осознанно.', { act: 'add-goal', label: '＋ Добавить цель' });
  return p.goals.map(g => {
    const amt = Number(g.amount) || 0, saved = goalSaved(g, a), prog = amt > 0 ? Math.min(100, saved / amt * 100) : 0;
    const endKey = goalEndKey(p, g), monthsLeft = Math.max(0, monthDiff(a.nowKey, endKey) + 1);
    const req = monthsLeft > 0 ? Math.max(0, (amt - saved) / monthsLeft) : Math.max(0, amt - saved);
    return `<div style="padding:13px 0;border-bottom:1px solid var(--stroke)">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <div><b style="font-family:var(--disp)">${escapeHtml(g.name)}</b> ${g.useSafe ? '<span class="tag safe">Сейф</span>' : ''}
          <span class="mini"> · до ${monthLabel(endKey, true)}${monthsLeft > 0 ? ` · ${monthsLeft} мес.` : ' · срок'}</span></div>
        <div><b>${fmt(saved > amt ? amt : saved)}</b> <span class="mini">/ ${fmt(amt)} · ${pct(prog)}</span></div>
      </div>
      <div class="progress ${prog >= 100 ? 'green' : g.useSafe ? '' : 'gold'}"><span style="width:${prog}%"></span></div>
      <div class="g-nums"><span>Нужно ${g.useSafe ? 'в Сейф' : 'откладывать'}: <b>${fmt(req)}/мес</b></span></div>
    </div>`;
  }).join('');
}
function safeOverviewHtml(p, a){
  const sg = p.goals.filter(g => g.useSafe && Number(g.amount) > 0);
  if (!sg.length) return emptyState('🔒', 'Сейфов нет', 'Включите «Сейф» у цели, чтобы копить под неё отдельно.');
  return sg.map(g => {
    const amt = Number(g.amount) || 0, bal = goalSafeBalance(g), endKey = goalEndKey(p, g);
    const monthsLeft = Math.max(0, monthDiff(a.nowKey, endKey) + 1);
    const req = monthsLeft > 0 ? Math.max(0, (amt - bal) / monthsLeft) : Math.max(0, amt - bal);
    const added = Number(g.safeByMonth[a.nowKey]) || 0, left = Math.max(0, req - added), prog = amt > 0 ? Math.min(100, bal / amt * 100) : 0;
    return `<div class="safe-box">
      <div class="safe-top"><span>🔒 ${escapeHtml(g.name)}</span><b>${fmt(bal)}</b></div>
      <div class="safe-mini">
        <div class="sm-c"><div class="l">Норма / мес</div><div class="v">${fmt(req)}</div></div>
        <div class="sm-c"><div class="l">В этом месяце</div><div class="v ${added > 0 ? 'pos' : ''}">${fmt(added)}</div></div>
        <div class="sm-c"><div class="l">Осталось доложить</div><div class="v ${left > 0 ? 'neg' : 'pos'}">${fmt(left)}</div></div>
        <div class="sm-c"><div class="l">Цель</div><div class="v">${pct(prog)}</div></div>
      </div>
      <div class="progress green"><span style="width:${prog}%"></span></div>
      <button class="btn gold sm block" data-act="add-safe" data-id="${g.id}" style="margin-top:11px">🔒 Отложить в Сейф</button>
    </div>`;
  }).join('');
}
function normControlHtml(p){
  const nc = computeNormControl(p);
  if (!nc.controlled) return emptyState('📏', 'Нормы не заданы', 'Задайте дневные нормы расходов в «Настройках».', { act: 'go-settings', label: 'В настройки' });
  if (!nc.perCat.length) return '<p class="mini">Нормы заданы, но ещё нет заполненных месяцев по этим категориям.</p>';
  const t = nc.totalDiff, cls = Math.abs(t) < 1 ? 'zero' : t < 0 ? 'under' : 'over';
  let html = `<div class="norm-total ${cls}"><span>Итог по нормам</span><span class="big">${t < 0 ? '+' : t > 0 ? '−' : ''}${fmt(Math.abs(t))}</span></div>`;
  html += nc.perCat.map(c => {
    const under = c.diff < 0, zero = Math.abs(c.diff) < 1;
    const txt = zero ? 'ровно по норме' : under ? 'Сэкономили ' + fmt(-c.diff) : 'Превысили ' + fmt(c.diff);
    return `<div class="norm-item"><span class="dot" style="background:${c.color}"></span>
      <span class="nm">${escapeHtml(c.name)}<small>факт ${fmt(c.actualSum)} из ${fmt(c.plannedSum)} · ${c.monthsCount} мес.</small></span>
      <span class="val ${zero ? '' : under ? 'pos' : 'neg'}">${under ? '▼ ' : zero ? '' : '▲ '}${txt}</span></div>`;
  }).join('');
  return html;
}
function recsHtml(p, a){
  const recs = [];
  if (!p.months.length){ recs.push(['info', '🗓️', 'Постройте план', 'Перейдите в «План» и задайте горизонт — появятся расчёты.']); return recs.map(recHtml).join(''); }
  const nextKey = addMonths(a.nowKey, 1);
  const nextRow = a.rows.find(r => r.key === nextKey) || a.rows.find(r => r.key > a.nowKey);
  const nextName = nextRow ? monthLabel(nextRow.key, true) : 'следующем месяце';
  if (p.goals.length){
    p.goals.forEach(g => {
      const amt = Number(g.amount) || 0; if (amt <= 0) return;
      const endKey = goalEndKey(p, g), monthsLeft = Math.max(0, monthDiff(a.nowKey, endKey) + 1);
      const saved = goalSaved(g, a), remaining = Math.max(0, amt - saved);
      if (remaining <= 0){ recs.push(['good', '🏆', `Цель «${escapeHtml(g.name)}» достигнута`, 'Отличная работа! Можно поставить новую.']); return; }
      if (monthsLeft <= 0){ recs.push(['bad', '⏰', `Срок цели «${escapeHtml(g.name)}» истёк`, `Не хватает ${fmt(remaining)}.`]); return; }
      const req = remaining / monthsLeft;
      if (g.useSafe){
        const added = Number(g.safeByMonth[a.nowKey]) || 0, left = Math.max(0, req - added);
        if (left > 1) recs.push(['warn', '🔒', `Сейф «${escapeHtml(g.name)}»`, `В ${monthLabel(a.nowKey, true)} доложите ещё <b>${fmt(left)}</b> (норма ${fmt(req)}/мес), чтобы успеть к ${monthLabel(endKey, true)}.`]);
        else recs.push(['good', '🔒', `Сейф «${escapeHtml(g.name)}»`, `Норма месяца выполнена (${fmt(added)}). Так держать!`]);
        return;
      }
      const planned = nextRow ? nextRow.net : a.avgNet, delta = req - planned;
      if (delta > 1) recs.push(['warn', '📈', `Цель «${escapeHtml(g.name)}»: нужно нагнать`, `В ${nextName} отложите на <b>${fmt(delta)} больше</b> (итого ${fmt(req)}/мес).`]);
      else recs.push(['good', '✅', `Цель «${escapeHtml(g.name)}»: по графику`, `Достаточно ${fmt(req)}/мес.`]);
    });
  } else {
    recs.push(['info', '◎', 'Добавьте цель', 'Пока показываю баланс доходов и расходов.']);
    if (a.avgNet > 0) recs.push(['good', '💰', 'Вы в плюсе', `В среднем ${fmt(a.avgNet)}/мес. Прогноз — ${fmt(a.finalCum)}.`]);
    else if (a.avgNet < 0) recs.push(['bad', '📉', 'Расходы больше доходов', `В среднем −${fmt(-a.avgNet)}/мес.`]);
  }
  if (a.savingsRate < 10 && a.totalIncome > 0) recs.push(['warn', '💡', 'Низкая норма сбережений', `Вы откладываете ${pct(a.savingsRate)}. Ориентир — 15–20%.`]);
  else if (a.savingsRate >= 20 && a.totalIncome > 0) recs.push(['good', '⭐', 'Высокая норма сбережений', `${pct(a.savingsRate)} дохода — отлично.`]);
  const neg = a.rows.filter(r => r.net < 0).length;
  if (neg > 0) recs.push(['bad', '⚠️', `Месяцев с дефицитом: ${neg}`, 'Расходы превышают доходы — накопления снижаются.']);
  if (!recs.length) recs.push(['good', '👍', 'Всё под контролем', 'Ваш план сбалансирован.']);
  return recs.map(recHtml).join('');
}

/* =========================================================
   GOALS
   ========================================================= */
function renderGoals(){
  const p = P(), a = analyze(p), nk = nowKey();
  const body = !p.goals.length
    ? emptyState('◎', 'Целей пока нет', 'Поставьте цель. Включите Сейф — и копите под неё отдельно от денег «на руках».', { act: 'add-goal', label: '＋ Создать цель' })
    : `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">` + p.goals.map(g => {
      const amt = Number(g.amount) || 0, mc = goalMonthsCount(p, g), endKey = goalEndKey(p, g);
      const monthsLeft = Math.max(0, monthDiff(nk, endKey) + 1);
      const saved = goalSaved(g, a), prog = amt > 0 ? Math.min(100, saved / amt * 100) : 0;
      const remaining = Math.max(0, amt - saved), req = monthsLeft > 0 ? remaining / monthsLeft : remaining;
      let safeBox = '';
      if (g.useSafe){
        const added = Number(g.safeByMonth[nk]) || 0, left = Math.max(0, req - added);
        safeBox = `<div class="safe-box">
          <div class="safe-top"><span>🔒 Сейф</span><b>${fmt(goalSafeBalance(g))}</b></div>
          <div class="safe-mini">
            <div class="sm-c"><div class="l">В этом месяце</div><div class="v ${added > 0 ? 'pos' : ''}">${fmt(added)}</div></div>
            <div class="sm-c"><div class="l">Осталось доложить</div><div class="v ${left > 0 ? 'neg' : 'pos'}">${fmt(left)}</div></div>
          </div>
          <button class="btn gold sm block" data-act="add-safe" data-id="${g.id}">🔒 Отложить в Сейф</button>
        </div>`;
      }
      return `<div class="card goal tilt ${g.useSafe ? 'safe' : ''}">
        <div class="g-head">
          <div><div class="g-name">${escapeHtml(g.name)} ${g.useSafe ? '<span class="tag safe">Сейф</span>' : ''}</div>
            <div class="g-meta">до ${monthLabel(endKey, true)} · ${mc} мес.${monthsLeft > 0 ? ` · осталось ${monthsLeft}` : ' · срок'}</div></div>
          <div class="row-gap"><button class="icon-btn sm" data-act="edit-goal" data-id="${g.id}">✎</button><button class="icon-btn sm" data-act="del-goal" data-id="${g.id}">🗑</button></div>
        </div>
        <div class="g-amt">${fmt(amt)}</div>
        <div class="progress ${prog >= 100 ? 'green' : g.useSafe ? '' : 'gold'}"><span style="width:${prog}%"></span></div>
        <div class="g-nums"><span>${g.useSafe ? 'В сейфе' : 'На руках'} ${pct(prog)}</span><span>${fmt(saved > amt ? amt : saved)}</span></div>
        <div class="chips"><span class="chip">Нужно: <b>${fmt(req)}/мес</b></span><span class="chip">Осталось: <b>${fmt(remaining)}</b></span></div>
        ${safeBox}
      </div>`;
    }).join('') + `</div>`;
  $('#view').innerHTML = `<div class="card">
    <div class="section-head"><div><h2>Финансовые цели</h2><p class="sub" style="margin:2px 0 0">«На руках» — свободные деньги · «Сейф» — отдельное хранилище под цель</p></div>
      <button class="btn primary" data-act="add-goal">＋ Новая цель</button></div>${body}</div>`;
}

/* =========================================================
   PLAN
   ========================================================= */
function renderPlan(){
  const p = P();
  const mode = 'months';
  $('#view').innerHTML = `
    <div class="card">
      <div class="section-head"><div><h2>Динамический план</h2><p class="sub" style="margin:2px 0 0">Горизонт меняется на лету — данные месяцев сохраняются</p></div></div>
      <div class="hint-box"><span>✨</span><span>Список месяцев <b>обновляется автоматически</b>. Будущие месяцы свёрнуты, текущий — раскрыт.</span></div>
      <div class="form-grid" style="margin-top:16px">
        <div><label class="flabel">Стартовый капитал, ₽ <span class="tip">?<span class="tt">Сколько уже накоплено на старте плана.</span></span></label><input type="number" class="fld" id="planStartBalance" value="${p.startBalance || 0}"></div>
        <div><label class="flabel">Первый месяц</label><input type="month" class="fld" id="planStartMonth" value="${p.startMonth}"></div>
        <div><label class="flabel">Способ срока</label><select class="fld" id="planMode"><option value="months">Кол-во месяцев</option><option value="date">До даты</option></select></div>
        <div id="planMonthsWrap"><label class="flabel">Месяцев</label><input type="number" class="fld" id="planMonths" min="1" max="600" value="${p.months.length || 12}"></div>
        <div id="planDateWrap" style="display:none"><label class="flabel">Последний месяц</label><input type="month" class="fld" id="planEndDate"></div>
        <div><button class="btn primary block" data-act="gen-plan">Построить / обновить</button></div>
      </div>
      <div class="divider"></div>
      <div class="toolbar">
        <button class="btn sm" data-act="fill-template">Заполнить типовыми</button>
        <button class="btn sm" data-act="expand-all">Развернуть все</button>
        <button class="btn sm" data-act="collapse-all">Свернуть все</button>
        <span style="flex:1"></span>
        <button class="btn sm danger" data-act="reset-plan">Сбросить план</button>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="plan-sum" id="planSum"></div>
      <div id="planList"></div>
    </div>`;
  renderPlanList();
  const nk = nowKey();
  if (p.months.some(m => m.key === nk)) setTimeout(() => { const c = $(`#planList .month[data-mkey="${nk}"]`); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 220);
}
function planSummaryHtml(p, a){
  const tg = a.totalGoal;
  return `
    <div class="ps">Месяцев в плане<b>${p.months.length}</b></div>
    <div class="ps">На руках (прогноз)<b>${fmt(a.handFinal)}</b></div>
    <div class="ps">В Сейфах<b>${fmt(a.safeTotal)}</b></div>
    <div class="ps">Средние сбережения<b class="${a.avgNet >= 0 ? 'pos' : 'neg'}">${fmt(a.avgNet)}/мес</b></div>
    ${tg > 0 ? `<div class="ps">Итог vs цели<b class="${a.finalCum >= tg ? 'pos' : 'warn'}">${pct(Math.min(100, a.finalCum / tg * 100))}</b></div>` : ''}`;
}
function renderPlanList(){
  const p = P(), a = analyze(p), stat = computeStatuses(p, a.rows);
  const sum = $('#planSum'); if (sum) sum.innerHTML = planSummaryHtml(p, a);
  const list = $('#planList'); if (!list) return;
  if (!p.months.length){ list.innerHTML = emptyState('▤', 'План ещё не построен', 'Задайте горизонт выше — список месяцев создастся автоматически.', { act: 'build-plan', label: 'Построить на 12 месяцев' }); return; }
  const sorted = [...p.months].sort((x, y) => x.key < y.key ? -1 : 1), nk = nowKey();
  list.innerHTML = sorted.map((m, idx) => monthCardHtml(p, m, idx, a, stat, nk)).join('');
}
function monthCardHtml(p, m, idx, a, stat, nk){
  const inc = sumObj(m.incomes), exp = sumObj(m.expenses), net = inc - exp;
  const row = a.rows.find(r => r.key === m.key) || { cumulative: 0 };
  const info = stat.map[m.key] || { status: 'neutral' }, st = info.status;
  const open = !p.collapsed[m.key], isCur = m.key === nk, locked = isLocked(m.key);
  const meta = statusMeta(stat.mode, st);
  return `<div class="month ${st} ${open ? 'open' : ''} ${isCur ? 'current' : ''} ${locked ? 'locked' : ''}" data-mkey="${m.key}">
    <div class="m-head" data-act="toggle-month" data-mkey="${m.key}">
      <div class="m-title"><span class="chev">▶</span>${monthLabel(m.key, true)}${isCur ? '<span class="now-chip">сейчас</span>' : ''}${locked ? '<span class="lock-chip">🔒</span>' : ''}</div>
      <div class="m-metrics">
        <span class="m">Доход: <b class="pos">${fmt(inc)}</b></span>
        <span class="m">Расход: <b class="neg">${fmt(exp)}</b></span>
        <span class="m">Отложено: <b class="${net >= 0 ? 'pos' : 'neg'}">${fmt(net)}</b></span>
        <span class="m">Накоплено: <b>${fmt(row.cumulative)}</b></span>
      </div>
      <span class="badge ${st}" title="${escapeHtml(statusTitle(stat.mode, info))}"><span>${meta.ic}</span>${meta.label}</span>
    </div>
    <div class="m-body">
      ${locked
        ? `<div class="lock-note"><span>🔒</span><span>Будущий месяц — ввод сумм заблокирован. Разрешён только комментарий. Отключить в «Настройках».</span></div>`
        : `<div class="qa-bar">
            <button class="btn qa inc" data-act="quick-add" data-mkey="${m.key}" data-type="income">＋ Доход</button>
            <button class="btn qa exp" data-act="quick-add" data-mkey="${m.key}" data-type="expense">＋ Расход</button>
            <span class="qa-hint">быстрый ввод с автосложением</span>
          </div>`}
      <div class="mb-cols">
        <div class="mb-col">
          <h4><span class="pos">▲ Доходы</span>${locked ? '' : `<button class="qa-mini inc" data-act="quick-add" data-mkey="${m.key}" data-type="income">＋</button>`}</h4>
          ${catsFor(p, 'income', m.key).map(c => catRow(m, c, 'income', locked)).join('') || '<span class="mini">Нет категорий</span>'}
          <div class="mb-total"><span>Итого доходов</span><span class="pos">${fmt(inc)}</span></div>
        </div>
        <div class="mb-col">
          <h4><span class="neg">▼ Расходы</span>${locked ? '' : `<button class="qa-mini exp" data-act="quick-add" data-mkey="${m.key}" data-type="expense">＋</button>`}</h4>
          ${catsFor(p, 'expense', m.key).map(c => catRow(m, c, 'expense', locked)).join('') || '<span class="mini">Нет категорий</span>'}
          <div class="mb-total"><span>Итого расходов</span><span class="neg">${fmt(exp)}</span></div>
        </div>
      </div>
      <div class="mb-note"><label class="flabel">Заметка</label><input class="fld" data-note-input data-mkey="${m.key}" value="${escapeHtml(m.note || '')}" placeholder="Напр. премия, отпуск, крупная покупка"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
        <span class="mini">Чистые за месяц: <b class="${net >= 0 ? 'pos' : 'neg'}">${fmt(net)}</b></span>
        <button class="btn sm" data-act="copy-prev" data-mkey="${m.key}" ${idx === 0 || locked ? 'disabled' : ''}>⧉ Копировать из пред. месяца</button>
      </div>
    </div>
  </div>`;
}
function catRow(m, c, type, locked){
  const val = (type === 'income' ? m.incomes : m.expenses)[c.id] || '';
  const row = `<div class="cat-row">
    <span class="dot" style="background:${c.color}"></span>
    <span class="cn" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}${c.scope === 'temporary' ? ' <span class="scope-badge">врем.</span>' : ''}</span>
    <input type="number" min="0" inputmode="numeric" data-cat-input data-mkey="${m.key}" data-type="${type}" data-cat="${c.id}" value="${val}" placeholder="0"${locked ? ' disabled' : ''}>
  </div>`;
  return (type === 'expense' && Number(c.dailyNorm) > 0) ? row + normLineHtml(m, c) : row;
}
function normLineHtml(m, c){
  const ns = normStatusFor(c, m); if (!ns) return '';
  let cls, txt;
  if (ns.state === 'empty'){ cls = 'empty'; txt = `Норма ${fmt(c.dailyNorm)}/дн → план ${fmt(ns.plan)}`; }
  else if (ns.state === 'under'){ cls = 'under'; txt = `План ${fmt(ns.plan)} · экономия ${fmt(-ns.diff)}`; }
  else { cls = 'over'; txt = `План ${fmt(ns.plan)} · перерасход ${fmt(ns.diff)}`; }
  return `<div class="norm-line ${cls}" data-normline="${m.key}:${c.id}">${txt}</div>`;
}
/* обновление одной карточки без перерисовки всего списка (стабильный ввод) */
function refreshPlanStatuses(){
  const p = P(), a = analyze(p), stat = computeStatuses(p, a.rows);
  const map = {}; $$('#planList .month').forEach(c => map[c.dataset.mkey] = c);
  a.rows.forEach(r => {
    const c = map[r.key]; if (!c) return;
    const mb = c.querySelectorAll('.m-metrics .m b');
    if (mb[3]) mb[3].textContent = fmt(r.cumulative);
    const info = stat.map[r.key] || { status: 'neutral' }, st = info.status, meta = statusMeta(stat.mode, st);
    c.classList.remove('ahead', 'behind', 'ontrack', 'neutral'); c.classList.add(st);
    const badge = c.querySelector('.badge');
    if (badge){ badge.className = 'badge ' + st; badge.innerHTML = `<span>${meta.ic}</span>${meta.label}`; badge.title = statusTitle(stat.mode, info); }
  });
  const sum = $('#planSum'); if (sum){ sum.innerHTML = planSummaryHtml(p, a); $$('#planSum .ps b').forEach(el => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }); }
  return map;
}
function updateMonthCard(key){
  const p = P(), m = p.months.find(x => x.key === key); if (!m) return;
  const inc = sumObj(m.incomes), exp = sumObj(m.expenses), net = inc - exp;
  const map = refreshPlanStatuses(), card = map[key]; if (!card) return;
  const totals = card.querySelectorAll('.mb-total span:last-child');
  if (totals[0]) totals[0].textContent = fmt(inc);
  if (totals[1]) totals[1].textContent = fmt(exp);
  const mb = card.querySelectorAll('.m-metrics .m b');
  if (mb[0]) mb[0].textContent = fmt(inc);
  if (mb[1]) mb[1].textContent = fmt(exp);
  if (mb[2]) { mb[2].textContent = fmt(net); mb[2].className = net >= 0 ? 'pos' : 'neg'; }
  p.categories.expense.forEach(c => {
    if (!(Number(c.dailyNorm) > 0)) return;
    const el = card.querySelector(`[data-normline="${key}:${c.id}"]`); if (!el) return;
    const tmp = document.createElement('div'); tmp.innerHTML = normLineHtml(m, c);
    const fresh = tmp.firstChild; if (fresh){ el.className = fresh.className; el.textContent = fresh.textContent; }
  });
}

/* =========================================================
   STATS
   ========================================================= */
function renderStats(){
  const p = P(), a = analyze(p);
  $('#view').innerHTML = `
    <div class="card">
      <div class="section-head"><div><h2>Статистика за период</h2><p class="sub" style="margin:2px 0 0">Сравнение с предыдущим периодом такой же длины</p></div>
        <div class="seg" id="periodPicker"></div></div>
      <div id="periodBox" style="margin-bottom:16px"></div>
      <div class="chart-wrap" style="height:150px"><canvas id="chartPeriodBars"></canvas></div>
    </div>
    <div class="grid g12" style="margin-top:16px">
      <div class="card c6"><div class="section-head"><h3 style="margin:0">Структура за период</h3>
        <select class="fld" id="pieMode" style="width:auto"><option value="expense">Расходы</option><option value="income">Доходы</option></select></div>
        <div class="chart-wrap pie"><canvas id="chartPie"></canvas></div><div class="legend" id="pieLegend"></div></div>
      <div class="card c6"><h3>Доходы и расходы</h3><div class="chart-wrap"><canvas id="chartFlow"></canvas></div></div>
    </div>`;
  renderPeriodPicker();
  renderPeriodBox();
  renderPeriodBar(p, a);
  renderPie(p, a);
  renderFlowChart(p, a);
}
function renderPeriodPicker(){
  const N = settings().statPeriod, picker = $('#periodPicker'); if (!picker) return;
  picker.innerHTML = [1, 3, 6, 12, 24].map(n => `<button class="seg-btn ${n === N ? 'active' : ''}" data-act="period" data-period="${n}">${n} мес</button>`).join('');
}
function renderPeriodBox(){
  const p = P(), a = analyze(p), N = settings().statPeriod, box = $('#periodBox'); if (!box) return;
  const { window, prev } = periodWindow(p, a, N);
  if (!window.length){ box.innerHTML = '<p class="mini">Нет данных за период.</p>'; return; }
  const w = sumRows(window), pr = sumRows(prev);
  const label = `${monthLabel(window[0].key)} — ${monthLabel(window[window.length - 1].key)} (${window.length} мес.)`;
  const delta = (cur, old, invert) => {
    if (!prev.length) return '';
    const d = cur - old; if (Math.abs(d) < 1) return '<span class="mini">= как ранее</span>';
    const good = invert ? d < 0 : d > 0;
    return `<span class="mini ${good ? 'pos' : 'neg'}">${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}</span>`;
  };
  box.innerHTML = `<div class="mini" style="margin-bottom:11px">Период: <b>${label}</b></div>
    <div class="period-grid">
      <div class="pcell"><div class="pl">Доходы</div><div class="pv pos">${fmt(w.income)}</div>${delta(w.income, pr.income, false)}</div>
      <div class="pcell"><div class="pl">Расходы</div><div class="pv neg">${fmt(w.expense)}</div>${delta(w.expense, pr.expense, true)}</div>
      <div class="pcell"><div class="pl">Накоплено</div><div class="pv ${w.net >= 0 ? 'pos' : 'neg'}">${fmt(w.net)}</div>${delta(w.net, pr.net, false)}</div>
      <div class="pcell"><div class="pl">В среднем/мес</div><div class="pv ${w.net >= 0 ? 'pos' : 'neg'}">${fmt(w.net / window.length)}</div><span class="mini">по ${window.length} мес.</span></div>
    </div>`;
}

/* =========================================================
   CATEGORIES
   ========================================================= */
function renderCategories(){
  const p = P();
  const item = (c, type) => {
    let used = 0; p.months.forEach(m => { if ((type === 'income' ? m.incomes : m.expenses)[c.id]) used++; });
    const tag = c.scope === 'temporary' ? `<span class="scope-badge">⏳ ${monthLabel(c.month || '', false)}</span>` : '';
    return `<div class="cat-item">
      <input type="color" class="color" value="${c.color}" data-catcolor-input data-id="${c.id}" data-type="${type}">
      <input class="cname" value="${escapeHtml(c.name)}" data-catname-input data-id="${c.id}" data-type="${type}">
      ${tag}<span class="used">${used ? used + ' мес.' : ''}</span>
      <button class="icon-btn sm" data-act="del-cat" data-id="${c.id}" data-type="${type}">🗑</button>
    </div>`;
  };
  $('#view').innerHTML = `
    <div class="grid g12">
      <div class="card c6"><div class="section-head"><h2 class="pos">Доходы</h2><button class="btn sm primary" data-act="add-cat" data-type="income">＋ Добавить</button></div>
        <p class="sub">Зарплата, подработка, инвестиции…</p>${p.categories.income.map(c => item(c, 'income')).join('') || '<span class="mini">Нет категорий</span>'}</div>
      <div class="card c6"><div class="section-head"><h2 class="neg">Расходы</h2><button class="btn sm primary" data-act="add-cat" data-type="expense">＋ Добавить</button></div>
        <p class="sub">Продукты, транспорт, аренда…</p>${p.categories.expense.map(c => item(c, 'expense')).join('') || '<span class="mini">Нет категорий</span>'}</div>
    </div>
    <div class="hint-box" style="margin-top:16px"><span>💡</span><span><b>Постоянные</b> категории есть во всех месяцах, <b>временные</b> — только в выбранном. Дневные нормы — в «Настройках».</span></div>`;
}

/* =========================================================
   SETTINGS
   ========================================================= */
function renderSettings(){
  const p = P();
  $('#view').innerHTML = `
    <div class="grid g12">
      <div class="card c6"><h2>Дневные нормы расходов</h2><p class="sub">План на месяц = норма × число дней. Пусто — не контролируется.</p><div id="normList"></div></div>
      <div class="card c6">
        <h2>Поведение</h2><p class="sub">Блокировка ввода сумм в будущих месяцах (комментарий остаётся).</p>
        <label class="switch"><input type="checkbox" id="lockFutureToggle" ${settings().lockFuture ? 'checked' : ''}><span class="track"><span class="knob"></span></span><span class="switch-label">Блокировать будущие месяцы</span></label>
        <div class="divider"></div>
        <h3>Профиль «${escapeHtml(p.name)}»</h3>
        <div class="toolbar">
          <button class="btn sm" data-act="new-profile">＋ Новый</button>
          <button class="btn sm" data-act="rename-profile">✎ Переименовать</button>
          <button class="btn sm danger" data-act="delete-profile">🗑 Удалить</button>
        </div>
      </div>
      <div class="card c6"><h2>Данные</h2><p class="sub">Хранятся только в браузере. Резервная копия и перенос.</p>
        <div class="toolbar"><button class="btn" data-act="export">⬇ Экспорт JSON</button><button class="btn" data-act="export-csv">⬇ План в CSV</button><button class="btn" data-act="import">⬆ Импорт</button></div></div>
      <div class="card c6"><h2 class="neg">Опасная зона</h2><p class="sub">Необратимо, с двойным подтверждением.</p>
        <div class="toolbar"><button class="btn sm danger" data-act="reset-plan">Сбросить план</button><button class="btn sm danger" data-act="wipe-all">Удалить всё</button></div></div>
    </div>`;
  renderNormList();
}
function renderNormList(){
  const p = P(), box = $('#normList'); if (!box) return;
  if (!p.categories.expense.length){ box.innerHTML = '<p class="mini">Нет категорий расходов.</p>'; return; }
  box.innerHTML = p.categories.expense.map(c => {
    const norm = Number(c.dailyNorm) > 0 ? c.dailyNorm : '';
    const perMo = Number(c.dailyNorm) > 0 ? `≈ ${fmt(c.dailyNorm * 30)}/мес` : 'не контролируется';
    return `<div class="norm-row"><span class="dot" style="background:${c.color}"></span><span class="nm">${escapeHtml(c.name)}</span>
      <span class="permo" data-permo="${c.id}">${perMo}</span>
      <div class="field"><input type="number" min="0" data-norm-input data-id="${c.id}" value="${norm}" placeholder="0"><span class="unit">₽/день</span></div></div>`;
  }).join('');
}
