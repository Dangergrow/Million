/* =========================================================
   app.js — делегирование событий, действия, модалки, init
   Никаких addEventListener по несуществующим элементам!
   ========================================================= */
'use strict';

/* ---------- Навигация ---------- */
function switchView(name){
  $$('#nav .nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  renderView(name);
  if (innerWidth < 960){ $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show'); }
  $('#viewScroll').scrollTop = 0;
}

/* ---------- План: горизонт ---------- */
function computeHorizon(){
  const sm = $('#planStartMonth').value || nowKey();
  const mode = $('#planMode').value;
  let count;
  if (mode === 'date'){
    const end = $('#planEndDate').value;
    if (!end) return { error: 'Укажите последний месяц' };
    count = monthDiff(sm, end) + 1;
    if (count < 1) return { error: 'Дата раньше начала' };
  } else {
    const raw = String($('#planMonths').value).trim();
    if (raw === '') return { error: 'Укажите количество месяцев' };
    count = clampNum(raw, 1, 600);
  }
  return { startMonth: sm, count };
}
function applyPlanHorizon(quiet){
  const p = P();
  if ($('#planStartBalance')) p.startBalance = Number($('#planStartBalance').value) || 0;
  const h = computeHorizon();
  if (h.error){ if (!quiet) toast(h.error, 'warn'); return false; }
  const oldSorted = [...p.months].sort((a, b) => a.key < b.key ? -1 : 1);
  const changed = (p.months.length !== h.count) || (oldSorted.length > 0 && oldSorted[0].key !== h.startMonth);
  const keys = []; for (let i = 0; i < h.count; i++) keys.push(addMonths(h.startMonth, i));
  const nc = {}, nk = nowKey();
  p.months = keys.map((k, i) => {
    const src = oldSorted[i];
    if (src){ nc[k] = p.collapsed[src.key] !== undefined ? p.collapsed[src.key] : k > nk; return { key: k, incomes: src.incomes || {}, expenses: src.expenses || {}, note: src.note || '' }; }
    nc[k] = k > nk; return { key: k, incomes: {}, expenses: {}, note: '' };
  });
  if (keys.includes(nk)) nc[nk] = false;
  p.collapsed = nc; p.startMonth = h.startMonth;
  saveNow(); renderPlanList();
  return changed;
}
const livePlanUpdate = debounce(() => applyPlanHorizon(true), 550);

/* ---------- Профили ---------- */
function createProfile(){
  openModal(`<h3>Новый профиль</h3><p class="msub">Профили независимы: свои цели, категории и план.</p>
    <label class="flabel">Название</label><input class="fld" id="npName" placeholder="Напр. Семейный бюджет">
    <div class="actions"><button class="btn ghost" data-close>Отмена</button><button class="btn primary" id="npSave">Создать</button></div>`);
  $('#npName').focus();
  $('#npSave').addEventListener('click', () => {
    const name = $('#npName').value.trim() || 'Новый профиль';
    const np = newProfile(name); np.goals = [];
    state.profiles.push(np); state.activeId = np.id;
    saveNow(); closeModal(); renderAll(); switchView('goals'); toast('Профиль создан', 'ok');
  });
}
function renameProfile(){
  const p = P();
  openModal(`<h3>Переименовать</h3><label class="flabel">Название</label><input class="fld" id="rpName" value="${escapeHtml(p.name)}">
    <div class="actions"><button class="btn ghost" data-close>Отмена</button><button class="btn primary" id="rpSave">Сохранить</button></div>`);
  const i = $('#rpName'); i.focus(); i.select();
  $('#rpSave').addEventListener('click', () => { p.name = i.value.trim() || p.name; saveNow(); renderProfiles(); closeModal(); renderView(currentView); toast('Готово', 'ok'); });
}
function deleteProfile(){
  const p = P();
  if (state.profiles.length <= 1){ toast('Нельзя удалить единственный профиль', 'warn'); return; }
  confirmAction({ title: 'Удалить профиль?', msg: `«${escapeHtml(p.name)}» будет удалён безвозвратно.`, danger: true, requireCheck: true, checkLabel: 'Подтверждаю удаление', confirmText: 'Удалить',
    onOk: () => { state.profiles = state.profiles.filter(x => x.id !== p.id); state.activeId = state.profiles[0].id; saveNow(); renderAll(); toast('Профиль удалён', 'ok'); } });
}

/* ---------- Цели / Сейф ---------- */
function goalModal(goal){
  const p = P(), editing = !!goal;
  goal = goal || { name: '', amount: '', mode: 'months', months: 12, endDate: addMonths(p.startMonth, 11), useSafe: false };
  openModal(`
    <h3>${editing ? 'Редактировать цель' : 'Новая цель'}</h3>
    <p class="msub">Сейф — отдельная копилка. Цель достигается только из денег в Сейфе.</p>
    <label class="flabel">Название</label><input class="fld" id="gName" value="${escapeHtml(goal.name)}" placeholder="Квартира, Подушка…">
    <div style="height:12px"></div><label class="flabel">Сумма, ₽</label><input class="fld" id="gAmount" type="number" min="0" value="${goal.amount}">
    <div style="height:12px"></div><label class="flabel">Срок</label>
    <select class="fld" id="gMode"><option value="months"${goal.mode === 'months' ? ' selected' : ''}>Кол-во месяцев</option><option value="date"${goal.mode === 'date' ? ' selected' : ''}>Конкретная дата</option></select>
    <div style="height:12px"></div>
    <div id="gMonthsWrap" style="${goal.mode === 'date' ? 'display:none' : ''}"><label class="flabel">Месяцев</label><input class="fld" id="gMonths" type="number" min="1" max="600" value="${goal.months || 12}"></div>
    <div id="gDateWrap" style="${goal.mode === 'date' ? '' : 'display:none'}"><label class="flabel">До даты</label><input class="fld" id="gDate" type="month" value="${goal.endDate || addMonths(p.startMonth, 11)}"></div>
    <label class="switch" style="margin-top:14px"><input type="checkbox" id="gSafe"${goal.useSafe ? ' checked' : ''}><span class="track"><span class="knob"></span></span><span class="switch-label">🔒 Откладывать в Сейф</span></label>
    <div class="hint-box" id="gCalc" style="margin-top:16px"></div>
    <div class="actions"><button class="btn ghost" data-close>Отмена</button><button class="btn primary" id="gSave">${editing ? 'Сохранить' : 'Добавить'}</button></div>`, true);
  const upd = () => {
    const mode = $('#gMode').value; $('#gMonthsWrap').style.display = mode === 'months' ? '' : 'none'; $('#gDateWrap').style.display = mode === 'date' ? '' : 'none';
    const amt = Number($('#gAmount').value) || 0;
    const mc = mode === 'date' ? Math.max(1, monthDiff(p.startMonth, $('#gDate').value || p.startMonth) + 1) : clampNum($('#gMonths').value, 1, 600);
    const safe = $('#gSafe').checked, base = safe ? 0 : (Number(p.startBalance) || 0), per = amt > 0 ? (amt - base) / mc : 0;
    $('#gCalc').innerHTML = `<span>🧮</span><span>Накопить <b>${fmt(amt)}</b> за <b>${mc} мес.</b>${safe ? ' (в Сейф, с нуля)' : ` (от старта ${fmt(p.startBalance)})`} → нужно ${safe ? 'докладывать' : 'откладывать'} <b>${fmt(Math.max(0, per))}/мес</b>.</span>`;
  };
  ['gAmount', 'gMonths', 'gDate', 'gMode', 'gSafe'].forEach(id => { const el = $('#' + id); el.addEventListener('input', upd); el.addEventListener('change', upd); });
  upd();
  $('#gSave').addEventListener('click', () => {
    const name = $('#gName').value.trim() || 'Без названия', amount = Number($('#gAmount').value) || 0;
    if (amount <= 0){ toast('Укажите сумму', 'warn'); return; }
    const mode = $('#gMode').value, months = clampNum($('#gMonths').value, 1, 600), endDate = $('#gDate').value || addMonths(p.startMonth, 11), useSafe = $('#gSafe').checked;
    if (editing) Object.assign(p.goals.find(x => x.id === goal.id), { name, amount, mode, months, endDate, useSafe });
    else p.goals.push({ id: uid(), name, amount, mode, months, endDate, useSafe, safeByMonth: {}, createdAt: Date.now() });
    saveNow(); closeModal(); renderAll(); toast('Цель сохранена', 'ok');
  });
}
function delGoal(id){
  const g = P().goals.find(x => x.id === id); if (!g) return;
  confirmAction({ title: 'Удалить цель?', msg: `«${escapeHtml(g.name)}»${g.useSafe ? ' и её Сейф' : ''} будут удалены.`, danger: true, requireCheck: true, checkLabel: 'Подтверждаю удаление', confirmText: 'Удалить',
    onOk: () => { P().goals = P().goals.filter(x => x.id !== id); saveNow(); renderAll(); toast('Цель удалена', 'ok'); } });
}
function addToSafeModal(id){
  const p = P(), g = p.goals.find(x => x.id === id); if (!g) return;
  const nk = nowKey(), bal = goalSafeBalance(g), added = Number(g.safeByMonth[nk]) || 0;
  openModal(`<h3>🔒 Отложить в Сейф · «${escapeHtml(g.name)}»</h3>
    <p class="msub">Прибавится к сейфу за ${monthLabel(nk, true)}. Баланс: <b>${fmt(bal)}</b> из ${fmt(g.amount)}.</p>
    <label class="flabel">Сумма, ₽</label><input class="fld" id="asAmount" type="number" min="0" inputmode="numeric" placeholder="0">
    <div class="hint-box" id="asPrev" style="margin-top:14px"></div>
    <div class="actions">${added > 0 ? '<button class="btn" id="asReset">Обнулить за месяц</button>' : ''}<button class="btn ghost" data-close>Отмена</button><button class="btn gold" id="asSave">Отложить</button></div>`);
  const upd = () => { const add = Number($('#asAmount').value) || 0; $('#asPrev').innerHTML = `<span>🧮</span><span>Было ${fmt(added)}. Станет <b>${fmt(added + add)}</b>. Баланс сейфа: <b>${fmt(bal + add)}</b>.</span>`; };
  $('#asAmount').addEventListener('input', upd);
  $('#asAmount').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); $('#asSave').click(); } });
  upd(); setTimeout(() => $('#asAmount').focus(), 50);
  if (added > 0) $('#asReset').addEventListener('click', () => { delete g.safeByMonth[nk]; saveNow(); closeModal(); renderAll(); toast('Обнулено', 'ok'); });
  $('#asSave').addEventListener('click', () => { const add = Number($('#asAmount').value) || 0; if (!(add > 0)){ toast('Введите сумму > 0', 'warn'); return; } g.safeByMonth[nk] = (Number(g.safeByMonth[nk]) || 0) + add; saveNow(); closeModal(); renderAll(); toast('В Сейф +' + fmt(add), 'ok'); });
}

/* ---------- Категории ---------- */
function addCategory(type){
  const p = P(), nk = nowKey(), color = PALETTE[p.categories[type].length % PALETTE.length];
  openModal(`<h3>Новая категория ${type === 'income' ? 'дохода' : 'расхода'}</h3><p class="msub">${type === 'income' ? 'Кэшбэк, дивиденды…' : 'Подписки, кафе…'}</p>
    <label class="flabel">Название</label><input class="fld" id="ncName" placeholder="Название">
    <div style="height:12px"></div><label class="flabel">Цвет</label><input type="color" id="ncColor" value="${color}" style="width:60px;height:40px;border:none;background:none;cursor:pointer">
    <div style="height:16px"></div><div class="seg" id="ncScope"><button type="button" class="seg-btn active" data-scope="permanent">Постоянная <span class="mini2">все мес.</span></button><button type="button" class="seg-btn" data-scope="temporary">Временная <span class="mini2">${monthLabel(nk, true)}</span></button></div>
    <div class="actions"><button class="btn ghost" data-close>Отмена</button><button class="btn primary" id="ncSave">Добавить</button></div>`);
  let scope = 'permanent';
  $$('#ncScope .seg-btn').forEach(b => b.addEventListener('click', () => { scope = b.dataset.scope; $$('#ncScope .seg-btn').forEach(x => x.classList.toggle('active', x === b)); }));
  $('#ncName').focus();
  $('#ncSave').addEventListener('click', () => {
    const name = $('#ncName').value.trim(); if (!name){ toast('Введите название', 'warn'); return; }
    const cat = { id: uid(), name, color: $('#ncColor').value, scope }; if (scope === 'temporary') cat.month = nk;
    p.categories[type].push(cat); saveNow(); closeModal(); renderView(currentView); toast('Категория добавлена', 'ok');
  });
}
function delCategory(id, type){
  const p = P(), c = p.categories[type].find(x => x.id === id); if (!c) return;
  let used = 0; p.months.forEach(m => { if ((type === 'income' ? m.incomes : m.expenses)[id]) used++; });
  confirmAction({ title: 'Удалить категорию?', msg: `«${escapeHtml(c.name)}»${used ? ` используется в <b>${used} мес.</b> — суммы удалятся` : ''}.`, danger: used > 0, requireCheck: used > 0, checkLabel: `Подтверждаю удаление данных из ${used} мес.`, confirmText: 'Удалить',
    onOk: () => { p.categories[type] = p.categories[type].filter(x => x.id !== id); p.months.forEach(m => delete (type === 'income' ? m.incomes : m.expenses)[id]); saveNow(); renderView(currentView); toast('Удалено', 'ok'); } });
}

/* ---------- Быстрый ввод ---------- */
function quickAddModal(monthKey, type){
  const p = P(), m = p.months.find(x => x.key === monthKey); if (!m) return;
  if (isLocked(monthKey)){ toast('Месяц заблокирован (будущий).', 'warn'); return; }
  const qcats = catsFor(p, type, monthKey), isInc = type === 'income', uc = p.categories[type].length;
  openModal(`<h3>${isInc ? '＋ Доход' : '＋ Расход'} <span class="mini">· ${monthLabel(monthKey, true)}</span></h3>
    <p class="msub">Сумма прибавится к категории (автосложение).</p>
    <label class="flabel">Категория</label>
    <select class="fld" id="qaCat">${qcats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}<option value="__new__">➕ Новая категория…</option></select>
    <div id="qaNewWrap" style="display:${qcats.length ? 'none' : 'block'};margin-top:14px">
      <label class="flabel">Название</label><div style="display:flex;gap:10px"><input type="color" id="qaColor" value="${PALETTE[uc % PALETTE.length]}" style="width:44px;height:42px;border:none;background:none;cursor:pointer;border-radius:9px"><input class="fld" id="qaNewName" placeholder="${isInc ? 'Кэшбэк' : 'Кафе'}"></div>
      <label class="switch" style="margin-top:12px"><input type="checkbox" id="qaTemp"><span class="track"><span class="knob"></span></span><span class="switch-label">Временная (только ${monthLabel(monthKey, true)})</span></label></div>
    <div style="height:14px"></div><label class="flabel">Сумма, ₽</label><input class="fld" id="qaAmount" type="number" min="0" inputmode="numeric" placeholder="0">
    <div class="hint-box" id="qaPrev" style="margin-top:14px"></div>
    <div class="actions"><button class="btn ghost" data-close>Отмена</button><button class="btn primary" id="qaSave">Добавить</button></div>`);
  const catSel = $('#qaCat'); if (!qcats.length) catSel.value = '__new__';
  const curSum = id => Number((isInc ? m.incomes : m.expenses)[id]) || 0;
  const upd = () => {
    const isNew = catSel.value === '__new__'; $('#qaNewWrap').style.display = isNew ? 'block' : 'none';
    const add = Number($('#qaAmount').value) || 0;
    const name = isNew ? ($('#qaNewName').value.trim() || 'Новая') : (qcats.find(c => c.id === catSel.value) || {}).name || '';
    const cur = isNew ? 0 : curSum(catSel.value);
    $('#qaPrev').innerHTML = `<span>🧮</span><span>«${escapeHtml(name)}»: ${fmt(cur)} + <b>${fmt(add)}</b> = <b>${fmt(cur + add)}</b></span>`;
  };
  catSel.addEventListener('change', upd); $('#qaAmount').addEventListener('input', upd); $('#qaNewName').addEventListener('input', upd);
  $('#qaAmount').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); $('#qaSave').click(); } });
  upd(); setTimeout(() => $('#qaAmount').focus(), 50);
  $('#qaSave').addEventListener('click', () => {
    const add = Number($('#qaAmount').value) || 0; if (!(add > 0)){ toast('Введите сумму > 0', 'warn'); return; }
    let catId = catSel.value;
    if (catId === '__new__'){
      const name = $('#qaNewName').value.trim(); if (!name){ toast('Введите название', 'warn'); return; }
      const scope = $('#qaTemp') && $('#qaTemp').checked ? 'temporary' : 'permanent';
      const cat = { id: uid(), name, color: $('#qaColor').value, scope }; if (scope === 'temporary') cat.month = monthKey;
      p.categories[type].push(cat); catId = cat.id;
    }
    const store = isInc ? m.incomes : m.expenses; store[catId] = (Number(store[catId]) || 0) + add;
    p.collapsed[monthKey] = false;
    saveNow(); closeModal(); renderView(currentView); toast((isInc ? 'Доход' : 'Расход') + ' +' + fmt(add), 'ok');
  });
}

/* ---------- Прочие действия ---------- */
function fillTemplate(){
  const p = P(); if (!p.months.length){ toast('Сначала постройте план', 'warn'); return; }
  const inc = p.categories.income[0], exp = p.categories.expense;
  openModal(`<h3>Заполнить типовыми</h3><p class="msub">Значения применятся ко всем месяцам.</p>
    <label class="flabel">Доход (${inc ? escapeHtml(inc.name) : '—'}), ₽</label><input class="fld" id="tI" type="number" min="0" placeholder="100000">
    <div style="height:12px"></div><label class="flabel">Расход (поровну), ₽</label><input class="fld" id="tE" type="number" min="0" placeholder="60000">
    <label class="switch" style="margin-top:14px"><input type="checkbox" id="tO"><span class="track"><span class="knob"></span></span><span class="switch-label">Перезаписать существующие</span></label>
    <div class="actions"><button class="btn ghost" data-close>Отмена</button><button class="btn primary" id="tApply">Применить</button></div>`);
  $('#tApply').addEventListener('click', () => {
    const iv = Number($('#tI').value) || 0, ev = Number($('#tE').value) || 0, ow = $('#tO').checked, per = exp.length ? ev / exp.length : 0;
    p.months.forEach(m => { const empty = sumObj(m.incomes) === 0 && sumObj(m.expenses) === 0; if (!ow && !empty) return; if (inc && iv > 0) m.incomes[inc.id] = iv; if (ev > 0) exp.forEach(c => m.expenses[c.id] = Math.round(per)); });
    saveNow(); closeModal(); renderPlanList(); toast('Применено', 'ok');
  });
}
function resetPlan(){
  confirmAction({ title: 'Сбросить план?', msg: 'Все месяцы и суммы удалятся. Цели и категории сохранятся.', danger: true, requireCheck: true, checkLabel: 'Да, удалить план', confirmText: 'Сбросить',
    onOk: () => { const p = P(); p.months = []; p.collapsed = {}; saveNow(); renderView(currentView); toast('План сброшен', 'ok'); } });
}
function wipeAll(){
  confirmAction({ title: 'Удалить ВСЕ данные?', msg: 'Все профили, цели и планы будут удалены безвозвратно.', danger: true, requireCheck: true, checkLabel: 'Понимаю, потеряю все данные', confirmText: 'Удалить всё',
    onOk: () => { state = defaultState(); saveNow(); renderAll(); switchView('dashboard'); toast('Всё удалено', 'ok'); } });
}
function exportData(){
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'millionaire-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); URL.revokeObjectURL(url); toast('Экспортировано', 'ok');
}
function exportCsv(){
  const p = P(), a = analyze(p); if (!p.months.length){ toast('План пуст', 'warn'); return; }
  const rows = [['Месяц', 'Доходы', 'Расходы', 'Отложено', 'Накоплено', 'Заметка']];
  [...p.months].sort((x, y) => x.key < y.key ? -1 : 1).forEach(m => { const r = a.rows.find(rr => rr.key === m.key); rows.push([monthLabel(m.key, true), r.income, r.expense, r.net, r.cumulative, (m.note || '').replace(/[\n;]/g, ' ')]); });
  const csv = '\uFEFF' + rows.map(r => r.join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' }), url = URL.createObjectURL(blob), a2 = document.createElement('a');
  a2.href = url; a2.download = 'plan-' + p.name + '.csv'; a2.click(); URL.revokeObjectURL(url); toast('CSV сохранён', 'ok');
}
function importData(file){
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !Array.isArray(data.profiles) || !data.profiles.length) throw new Error('Неверный формат');
      confirmAction({ title: 'Импортировать?', msg: `Файл: <b>${data.profiles.length} профил.</b> Текущие данные заменятся.`, danger: true, requireCheck: true, checkLabel: 'Заменить данные', confirmText: 'Импортировать',
        onOk: () => { state = migrate(data); saveNow(); renderAll(); toast('Импортировано', 'ok'); } });
    } catch (err){ toast('Ошибка: ' + err.message, 'err'); }
  };
  reader.readAsText(file);
}
function tbQuick(type){ const nk = nowKey(); if (!P().months.some(m => m.key === nk)){ toast('Текущий месяц вне плана — постройте план', 'warn'); return; } quickAddModal(nk, type); }
function toggleMonth(mkey, el){
  const card = el.closest('.month'); const open = card.classList.toggle('open');
  P().collapsed[mkey] = !open; saveState();
}
function copyPrev(mkey){
  const p = P(), sorted = [...p.months].sort((a, b) => a.key < b.key ? -1 : 1), idx = sorted.findIndex(x => x.key === mkey);
  if (idx <= 0) return;
  const prev = sorted[idx - 1], cur = sorted.find(x => x.key === mkey);
  cur.incomes = { ...prev.incomes }; cur.expenses = { ...prev.expenses };
  saveNow(); renderPlanList(); toast('Скопировано из ' + monthLabel(prev.key, true), 'ok');
}

/* ---------- Карта действий (click) ---------- */
const ACTIONS = {
  'menu-toggle': () => { $('#sidebar').classList.toggle('open'); $('#scrim').classList.toggle('show'); },
  'new-profile': createProfile, 'rename-profile': renameProfile, 'delete-profile': deleteProfile,
  'tb-income': () => tbQuick('income'), 'tb-expense': () => tbQuick('expense'),
  'add-goal': () => goalModal(null),
  'edit-goal': el => goalModal(P().goals.find(x => x.id === el.dataset.id)),
  'del-goal': el => delGoal(el.dataset.id),
  'add-safe': el => addToSafeModal(el.dataset.id),
  'quick-add': el => quickAddModal(el.dataset.mkey, el.dataset.type),
  'toggle-month': (el) => toggleMonth(el.dataset.mkey, el),
  'copy-prev': el => copyPrev(el.dataset.mkey),
  'gen-plan': () => { if (applyPlanHorizon(false) !== false) toast('План обновлён: ' + P().months.length + ' мес.', 'ok'); },
  'fill-template': fillTemplate,
  'expand-all': () => { const p = P(); p.months.forEach(m => p.collapsed[m.key] = false); saveNow(); renderPlanList(); },
  'collapse-all': () => { const p = P(); p.months.forEach(m => p.collapsed[m.key] = true); saveNow(); renderPlanList(); },
  'reset-plan': resetPlan,
  'add-cat': el => addCategory(el.dataset.type),
  'del-cat': el => delCategory(el.dataset.id, el.dataset.type),
  'period': el => { settings().statPeriod = Number(el.dataset.period); saveNow(); const p = P(), a = analyze(p); renderPeriodPicker(); renderPeriodBox(); renderPeriodBar(p, a); renderPie(p, a); },
  'export': exportData, 'export-csv': exportCsv, 'import': () => $('#importFile').click(),
  'wipe-all': wipeAll,
  'empty-action': el => { const act = el.dataset.empty; if (act === 'add-goal') goalModal(null); else if (act === 'go-settings') switchView('settings'); else if (act === 'build-plan'){ switchView('plan'); setTimeout(() => { if ($('#planMode')) $('#planMode').value = 'months'; if ($('#planMonths')) $('#planMonths').value = 12; applyPlanHorizon(false); }, 60); } }
};

/* ---------- Делегирование ---------- */
function wire(){
  document.addEventListener('click', e => {
    if (e.target.closest('[data-close]')){ closeModal(); return; }
    if (e.target.id === 'overlay' || e.target.id === 'scrim'){ closeModal(); if (e.target.id === 'scrim'){ $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show'); } return; }
    const nav = e.target.closest('.nav-item'); if (nav){ switchView(nav.dataset.view); return; }
    const el = e.target.closest('[data-act]'); if (!el) return;
    const fn = ACTIONS[el.dataset.act]; if (fn) fn(el);
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset && t.dataset.catInput !== undefined){
      const p = P(), m = p.months.find(x => x.key === t.dataset.mkey); if (!m) return;
      const store = t.dataset.type === 'income' ? m.incomes : m.expenses;
      let v = Number(t.value); if (isNaN(v) || v < 0) v = 0;
      if (!t.value || v === 0) delete store[t.dataset.cat]; else store[t.dataset.cat] = v;
      saveState(); updateMonthCard(t.dataset.mkey); return;
    }
    if (t.dataset && t.dataset.noteInput !== undefined){ const m = P().months.find(x => x.key === t.dataset.mkey); if (m){ m.note = t.value; saveState(); } return; }
    if (t.dataset && t.dataset.normInput !== undefined){
      const c = P().categories.expense.find(x => x.id === t.dataset.id); if (!c) return;
      let v = Number(t.value); if (isNaN(v) || v < 0) v = 0;
      if (v > 0) c.dailyNorm = v; else delete c.dailyNorm;
      const pm = $(`#normList [data-permo="${c.id}"]`); if (pm) pm.textContent = v > 0 ? `≈ ${fmt(v * 30)}/мес` : 'не контролируется';
      saveState(); return;
    }
    if (['planStartBalance', 'planStartMonth', 'planMonths', 'planEndDate'].includes(t.id)){
      if (t.id === 'planStartBalance'){ P().startBalance = Number(t.value) || 0; saveState(); refreshPlanStatuses(); }
      else livePlanUpdate();
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'profileSelect'){ state.activeId = t.value; saveNow(); renderAll(); return; }
    if (t.id === 'pieMode'){ renderPie(P(), analyze(P())); return; }
    if (t.id === 'lockFutureToggle'){ settings().lockFuture = t.checked; saveNow(); toast(t.checked ? 'Будущие месяцы заблокированы' : 'Блокировка снята', 'ok'); return; }
    if (t.id === 'planMode'){ const d = t.value === 'date'; $('#planMonthsWrap').style.display = d ? 'none' : ''; $('#planDateWrap').style.display = d ? '' : 'none'; if (d && !$('#planEndDate').value) $('#planEndDate').value = addMonths(P().startMonth, 11); applyPlanHorizon(true); return; }
    if (['planStartMonth', 'planMonths', 'planEndDate'].includes(t.id)){ applyPlanHorizon(true); saveNow(); return; }
    if (t.id === 'planStartBalance'){ P().startBalance = Math.max(0, Number(t.value) || 0); t.value = P().startBalance; saveNow(); return; }
    if (t.dataset && t.dataset.catInput !== undefined){ if (t.value !== '') t.value = String(Math.max(0, Number(t.value) || 0)); saveNow(); return; }
    if (t.dataset && t.dataset.normInput !== undefined){ saveNow(); return; }
    if (t.dataset && t.dataset.catnameInput !== undefined){ const c = P().categories[t.dataset.type].find(x => x.id === t.dataset.id); if (c){ c.name = t.value.trim() || 'Без названия'; saveNow(); toast('Обновлено', 'ok'); } return; }
    if (t.dataset && t.dataset.catcolorInput !== undefined){ const c = P().categories[t.dataset.type].find(x => x.id === t.dataset.id); if (c){ c.color = t.value; saveNow(); } return; }
    if (t.id === 'importFile'){ if (t.files[0]){ importData(t.files[0]); t.value = ''; } return; }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.catInput !== undefined) e.target.blur();
  });
  document.addEventListener('focusin', e => { if (e.target.dataset && e.target.dataset.catInput !== undefined) e.target.select(); });
}

function init(){ state = loadState(); wire(); renderAll(); }
init();
