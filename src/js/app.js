/* ================= sp — app boot ================= */
let CTX = null;

const RU_DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function toast(text, ms) {
  const holder = document.getElementById('toast-holder');
  const t = el('div', 'toast', text);
  holder.appendChild(t);
  setTimeout(() => t.remove(), ms || 4000);
}

function openModal(node) {
  const root = document.getElementById('modal-root');
  const box = el('div', 'modal');
  const x = el('button', 'close-x', '×');
  x.onclick = () => root.classList.add('hidden');
  box.appendChild(x);
  box.appendChild(node);
  root.innerHTML = '';
  root.appendChild(box);
  root.classList.remove('hidden');
  root.onclick = (e) => { if (e.target === root) root.classList.add('hidden'); };
}
function closeModal() { document.getElementById('modal-root').classList.add('hidden'); }

function applyUi() {
  const ui = Store.data.ui;
  document.body.className = ui.theme || 'theme-coquette';
  if (ui.accent) {
    document.documentElement.style.setProperty('--accent', ui.accent);
  } else {
    document.documentElement.style.removeProperty('--accent');
  }
  const bg = document.getElementById('bg-layer');
  bg.style.backgroundImage = ui.bgFile ? 'url("file:///' + String(ui.bgFile).replace(/\\/g, '/') + '")' : 'none';
  document.documentElement.style.setProperty('--title-font',
    ui.fonts === 'sans' ? "'Segoe UI', system-ui, sans-serif" : "'Georgia', 'Times New Roman', serif");
}

/* ---------- планирование ---------- */
function manualBusyToday() {
  const wob = new Date().getDay();
  const list = Store.data.settings.busyManual || [];
  return list.filter(b => b.day === wob).map(b => ({
    start: b.start, end: b.end, title: b.title, type: 'busy'
  }));
}

function replan(manual) {
  const s = Store.data.settings;
  const now = new Date();
  const dayIdx = (now.getDay() + 6) % 7; /* пн = 0 */
  const tt = (s.edupage && s.edupage.lastTimetable) || null;
  const busy = timetableToBusy(tt, dayIdx).concat(manualBusyToday());

  const overdue = Store.data.tasks.filter(t => !t.done && t.deadline && t.deadline < todayStr());
  for (const o of overdue) o.priority = Math.max(o.priority || 1, 3);

  const blocks = planDay({
    wake: s.wake,
    sleep: s.sleep,
    busy,
    tasks: Store.data.tasks.filter(t => !t.done),
    desires: Store.data.desires,
    energy: s.energy,
    warmupOn: s.warmupOn !== false,
    warmupIntervalMin: s.warmupIntervalMin,
    warmupLengthMin: s.warmupLengthMin,
    nowMin: now.getHours() * 60 + now.getMinutes()
  });
  Store.patch(d => { d.plan = blocks; d.planDate = todayStr(); });
  if (Widgets.planner.refresh) Widgets.planner.refresh(blocks);
  if (manual) {
    const st = planStats(blocks);
    toast('план собран ✨ учебы: ' + durText(st.task) + ' · желаний: ' + durText(st.desire) +
      ' · разминок: ' + Math.round(st.warm / Math.max(1, s.warmupLengthMin || 5)));
  }
}

/* ---------- разминки ---------- */
let lastWarmup = Date.now();
function warmupLoop() {
  setInterval(() => {
    const s = Store.data.settings;
    if (s.warmupOn === false) return;
    const intervalMs = Math.max(20, s.warmupIntervalMin || 60) * 60000;
    if (Date.now() - lastWarmup >= intervalMs) {
      lastWarmup = Date.now();
      const name = Store.data.profile.name || 'girl';
      toast('разминка, ' + name + ' ♡ встань, потянись, посмотри в окно — ' + (s.warmupLengthMin || 5) + ' мин');
      window.sp.notify('разминка ♡', 'встань и потянись, ' + (s.warmupLengthMin || 5) + ' мин');
    }
  }, 20000);
}

/* ---------- дашборд ---------- */
function buildDashboard() {
  const dash = document.getElementById('dashboard');
  dash.innerHTML = '';
  const defs = Store.data.ui.widgets;
  const names = Object.keys(defs).filter(n => defs[n].on !== false).sort((a, b) => defs[a].order - defs[b].order);

  for (const name of names) {
    const def = Widgets[name];
    if (!def) continue;
    const cfg = defs[name];
    const w = el('div', 'widget size-' + (cfg.size || 'm'));
    w.dataset.widget = name;

    const head = el('div', 'widget-head');
    head.setAttribute('draggable', 'true');
    head.innerHTML = '<span class="widget-title">' + esc(def.title) + '</span>';
    const ctl = el('div', 'widget-ctl');
    const mkBtn = (txt, title, fn) => {
      const b = document.createElement('button');
      b.textContent = txt; b.title = title; b.onclick = fn;
      return b;
    };
    ctl.appendChild(mkBtn('–', 'уменьшить', () => cycleSize(name, -1)));
    ctl.appendChild(mkBtn('+', 'увеличить', () => cycleSize(name, +1)));
    ctl.appendChild(mkBtn('×', 'спрятать виджет', () => {
      Store.patch(d => { d.ui.widgets[name] = { ...d.ui.widgets[name], on: false }; });
      buildDashboard();
      toast('виджет спрятан — вернуть можно в настройках ♡');
    }));
    head.appendChild(ctl);
    w.appendChild(head);

    const body = el('div', 'widget-body');
    w.appendChild(body);
    dash.appendChild(w);

    try { def.render(body, CTX); }
    catch (e) { body.innerHTML = '<div class="anki-status">виджет покашлял: ' + esc(String(e)) + '</div>'; }
  }
  enableDrag();
}

function cycleSize(name, dir) {
  const order = ['s', 'm', 'l'];
  const cfg = Store.data.ui.widgets[name];
  const i = order.indexOf(cfg.size || 'm');
  const next = order[Math.min(order.length - 1, Math.max(0, i + dir))];
  Store.patch(d => { d.ui.widgets[name] = { ...d.ui.widgets[name], size: next }; });
  buildDashboard();
}

function enableDrag() {
  const dash = document.getElementById('dashboard');
  let dragName = null;
  dash.addEventListener('dragstart', (e) => {
    const head = e.target.closest ? e.target.closest('.widget-head') : null;
    if (!head) return;
    const w = head.closest('.widget');
    dragName = w.dataset.widget;
    w.classList.add('dragging');
    e.dataTransfer.setData('text/plain', dragName);
  });
  dash.addEventListener('dragend', () => {
    document.querySelectorAll('.widget.dragging,.widget.drop-target')
      .forEach(x => x.classList.remove('dragging', 'drop-target'));
  });
  dash.addEventListener('dragover', (e) => {
    const w = e.target.closest ? e.target.closest('.widget') : null;
    e.preventDefault();
    document.querySelectorAll('.widget.drop-target').forEach(x => x.classList.remove('drop-target'));
    if (w && w.dataset.widget !== dragName) w.classList.add('drop-target');
  });
  dash.addEventListener('drop', (e) => {
    const target = e.target.closest ? e.target.closest('.widget') : null;
    if (!target || !dragName || target.dataset.widget === dragName) return;
    e.preventDefault();
    const cfg = Store.data.ui.widgets;
    const from = cfg[dragName].order;
    const to = cfg[target.dataset.widget].order;
    for (const n of Object.keys(cfg)) {
      if (cfg[n].order === to) cfg[n].order = from;
      else if (cfg[n].order === from) cfg[n].order = to;
    }
    Store.patch(() => {});
    buildDashboard();
  });
}

function renderWidget(name) {
  const node = document.querySelector('.widget[data-widget="' + name + '"]');
  if (!node) return;
  const body = node.querySelector('.widget-body');
  try { Widgets[name].render(body, CTX); }
  catch (e) { body.innerHTML = '<div class="anki-status">виджет покашлял: ' + esc(String(e)) + '</div>'; }
}

/* ---------- настройки ---------- */
function normalizeSchool(v) {
  v = (v || '').trim();
  if (!v) return '';
  if (!/^https?:\/\//.test(v)) v = 'https://' + v;
  return v.replace(/\/(timetable)?\/?$/, '');
}

function openSettings() {
  const s = Store.data.settings;
  const ui = Store.data.ui;
  const box = el('div');
  box.innerHTML = `
    <h2>настройки ♡</h2>
    <label class="field">как тебя звать?
      <input id="s-name" value="${esc(Store.data.profile.name || '')}"></label>

    <div class="row" style="margin-bottom:14px">
      <span style="font-size:13px;color:var(--muted)">тема:</span>
      <span class="theme-dot theme-coquette ${ui.theme === 'theme-coquette' ? 'active' : ''}" data-th="theme-coquette"></span>
      <span class="theme-dot theme-neutral ${ui.theme === 'theme-neutral' ? 'active' : ''}" data-th="theme-neutral"></span>
      <span class="theme-dot theme-darkpink ${ui.theme === 'theme-darkpink' ? 'active' : ''}" data-th="theme-darkpink"></span>
      <input type="color" id="s-accent" value="${esc(ui.accent || '#e56995')}" title="свой акцент" style="width:40px;padding:2px">
      <button class="btn outline mini" id="s-bg">фон-картинка</button>
      <button class="btn outline mini" id="s-bg-off">убрать фон</button>
    </div>

    <div class="row" style="margin-bottom:14px">
      <label class="field" style="margin:0">подъём <input id="s-wake" type="time" value="${esc(s.wake)}"></label>
      <label class="field" style="margin:0">сон <input id="s-sleep" type="time" value="${esc(s.sleep)}"></label>
      <label class="field" style="margin:0">разминка каждые, мин
        <input id="s-warm-int" type="number" min="20" max="240" value="${esc(s.warmupIntervalMin)}" style="width:80px"></label>
      <label class="field" style="margin:0">длина, мин
        <input id="s-warm-len" type="number" min="2" max="30" value="${esc(s.warmupLengthMin)}" style="width:80px"></label>
      <label style="font-size:13px"><input type="checkbox" id="s-warm-on" ${s.warmupOn !== false ? 'checked' : ''}> разминки вкл</label>
    </div>

    <label class="field">желания (строка = одно: "танцевать в кухне | 15")
      <textarea id="s-desires" rows="3">${esc((Store.data.desires || []).map(d => d.title + ' | ' + d.durationMin).join('\n'))}</textarea></label>

    <label class="field">уроки вручную, если edupage не подтянулся (строка: "пн 08:40-09:25 Математика 204")
      <textarea id="s-busy" rows="3">${esc((s.busyManual || []).map(b => RU_DOW[b.day] + ' ' + b.start + '-' + b.end + ' ' + b.title).join('\n'))}</textarea></label>

    <label class="field">edupage: адрес школы и класс
      <div class="row">
        <input id="s-edu-url" value="${esc(s.edupage.schoolUrl || '')}" placeholder="fmalmnis.edupage.org" style="flex:1">
        <input id="s-edu-class" value="${esc(s.edupage.classId || '7A')}" style="width:70px">
        <button class="btn mini" id="s-edu-load">подтянуть ✧</button>
      </div>
      <div id="s-edu-status" style="font-size:12px;color:var(--muted);margin-top:4px"></div></label>

    <label class="field">нейро-парсер (необязательно! бесплатный ключ)
      <div class="row">
        <select id="s-llm-prov" style="width:210px">
          <option value="gemini" ${s.llm.provider === 'gemini' ? 'selected' : ''}>Google Gemini (бесплатный ключ)</option>
          <option value="groq" ${s.llm.provider === 'groq' ? 'selected' : ''}>Groq (бесплатный ключ)</option>
        </select>
        <input id="s-llm-key" type="password" value="${esc(s.llm.key || '')}" placeholder="вставь ключ, живёт только на ноуте" style="flex:1">
      </div></label>

    <label class="field">валидный список окон для фокус-стража (через запятую)
      <textarea id="s-whitelist" rows="2">${esc((s.focus.whitelist || []).join(', '))}</textarea></label>

    <label class="field">виджеты (верни спрятанные)
      <div class="row" id="s-widgets"></div></label>

    <div class="row" style="margin-top:14px">
      <button class="btn" id="s-save">сохранить ♡</button>
      <span style="font-size:12px;color:var(--muted)">всё живёт локально на ноуте</span>
    </div>`;

  const wg = box.querySelector('#s-widgets');
  for (const [name, def] of Object.entries(Widgets)) {
    const cfg = Store.data.ui.widgets[name];
    const lab = document.createElement('label');
    lab.style.cssText = 'font-size:13px;margin-right:10px';
    lab.innerHTML = '<input type="checkbox" data-w="' + name + '" ' + (!cfg || cfg.on !== false ? 'checked' : '') + '> ' + esc(def.title);
    wg.appendChild(lab);
  }

  box.querySelectorAll('.theme-dot').forEach(dot => {
    dot.onclick = () => {
      box.querySelectorAll('.theme-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      document.body.className = dot.dataset.th;
    };
  });
  box.querySelector('#s-bg').onclick = async () => {
    const f = await window.sp.pickImage();
    if (f) Store.patch(d => { d.ui.bgFile = f; });
    applyUi();
  };
  box.querySelector('#s-bg-off').onclick = () => {
    Store.patch(d => { d.ui.bgFile = null; });
    applyUi();
  };
  box.querySelector('#s-accent').oninput = (e) => {
    Store.patch(d => { d.ui.accent = e.target.value; });
    applyUi();
  };
  box.querySelector('#s-edu-load').onclick = async () => {
    const url = normalizeSchool(box.querySelector('#s-edu-url').value);
    const cid = box.querySelector('#s-edu-class').value.trim() || '7A';
    if (!url) { box.querySelector('#s-edu-status').textContent = 'впиши адрес школы'; return; }
    box.querySelector('#s-edu-status').textContent = 'тяну расписание…';
    const tt = await fetchTimetable(url, cid);
    if (tt) {
      Store.patch(d => { d.settings.edupage.schoolUrl = url; d.settings.edupage.classId = cid; d.settings.edupage.lastTimetable = tt; });
      box.querySelector('#s-edu-status').textContent = 'готово ✧ уроков: ' + tt.days.reduce((a, d2) => a + d2.lessons.length, 0);
      replan(false);
    } else {
      Store.patch(d => { d.settings.edupage.schoolUrl = url; d.settings.edupage.classId = cid; });
      box.querySelector('#s-edu-status').textContent = 'автоматом не вышло — впиши уроки в поле выше, это 2 минуты ♡';
    }
  };
  box.querySelector('#s-save').onclick = () => {
    const v = id => box.querySelector(id).value;
    const wl = v('#s-whitelist').split(',').map(x => x.trim()).filter(Boolean);
    const busyLines = v('#s-busy').split('\n').map(line => {
      const m = line.trim().match(/^(\S{1,3})\s+(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})\s+(.+)$/i);
      if (!m) return null;
      const day = RU_DOW.findIndex(d => m[1].toLowerCase().startsWith(d));
      if (day < 0) return null;
      return { day, start: normTime(m[2]), end: normTime(m[3]), title: m[4].trim() };
    }).filter(Boolean);
    const widgetsOn = {};
    box.querySelectorAll('#s-widgets input').forEach(cb => { widgetsOn[cb.dataset.w] = cb.checked; });
    const activeTheme = (function(){
      const a = box.querySelector('.theme-dot.active');
      return a ? a.dataset.th : null;
    })();

    Store.patch(d => {
      d.profile.name = v('#s-name').trim() || 'girl';
      if (activeTheme) d.ui.theme = activeTheme;
      d.ui.accent = box.querySelector('#s-accent').value || null;
      d.settings.wake = v('#s-wake');
      d.settings.sleep = v('#s-sleep');
      d.settings.warmupOn = box.querySelector('#s-warm-on').checked;
      d.settings.warmupIntervalMin = Math.max(20, +v('#s-warm-int') || 60);
      d.settings.warmupLengthMin = Math.max(2, +v('#s-warm-len') || 5);
      d.settings.busyManual = busyLines;
      d.settings.focus.whitelist = wl;
      d.settings.llm.provider = v('#s-llm-prov');
      d.settings.llm.key = v('#s-llm-key').trim();
      d.desires = v('#s-desires').split('\n').map(line => {
        const m = line.split('|');
        if (!m[0] || !m[0].trim()) return null;
        return { id: 'd' + m[0].trim(), title: m[0].trim(), durationMin: Math.max(10, +((m[1] || '').trim()) || 30) };
      }).filter(Boolean);
      for (const [name, on] of Object.entries(widgetsOn)) {
        if (d.ui.widgets[name]) d.ui.widgets[name] = { ...d.ui.widgets[name], on };
      }
    });
    closeModal();
    applyUi();
    buildDashboard();
    replan(false);
    toast('сохранила ♡');
  };

  openModal(box);
}

/* ---------- boot ---------- */
async function boot() {
  await Store.load();
  applyUi();

  CTX = {
    toast,
    openModal,
    closeModal,
    replan,
    renderAll: (name) => {
      renderWidget(name);
      if (name === 'planner' && Widgets.planner.refresh) Widgets.planner.refresh(Store.data.plan || []);
    }
  };

  document.getElementById('btn-settings').onclick = openSettings;

  const topClock = document.getElementById('topbar-clock');
  const tickTop = () => {
    const n = new Date();
    topClock.textContent = n.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) +
      ' · ' + n.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };
  tickTop();
  setInterval(tickTop, 15000);

  buildDashboard();

  if (Store.data.planDate !== todayStr() || !Store.data.plan) replan(false);
  else if (Widgets.planner.refresh) Widgets.planner.refresh(Store.data.plan);

  warmupLoop();

  window.sp.focus.onViolation(() => {
    toast('фокус, ' + (Store.data.profile.name || 'girl') + ' ♡ ты обещала');
  });

  window.sp.notify('sp проснулась ♡', 'sweet spot готов улаживать твой день');
}

document.addEventListener('DOMContentLoaded', boot);
