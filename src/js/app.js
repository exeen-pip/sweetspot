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

/* ---------- дашборд: окна как на ноутбуке ---------- */
const WIDGET_META = {
  clock:      { icon: '🕰️', desc: 'время, дата и мягкое приветствие дня' },
  planner:    { icon: '🗓️', desc: 'автоплан: учёба, желания и разминки по энергии' },
  inbox:      { icon: '📥', desc: 'быстро кинуть мысль — разложить позже' },
  tasks:      { icon: '📌', desc: 'дела с дедлайнами и приоритетами' },
  notes:      { icon: '💌', desc: 'заметки-стикеры' },
  player:     { icon: '🎧', desc: 'музыка из папки или плейлиста' },
  calculator: { icon: '🧮', desc: 'калькулятор под рукой' },
  anki:       { icon: '🃏', desc: 'карточки анки: обзор и повторения' },
  focus:      { icon: '🛡️', desc: 'фокус-страж: не даст уйти в думскроллинг' }
};
const WIDGET_COLORS = ['#e56995', '#e88a5d', '#b57fd6', '#7fa8e0', '#77c79a', '#e6c05a', '#e8837f', '#9c8b7a'];
const WIN_MIN_W = 250, WIN_MIN_H = 130;
let winZ = 100;

function bringFront(w) { w.style.zIndex = ++winZ; }

function placeWin(w, cfg, collapsed) {
  w.style.left = cfg.x + 'px';
  w.style.top = cfg.y + 'px';
  w.style.width = cfg.w + 'px';
  w.style.height = (collapsed ? 52 : cfg.h) + 'px';
}

function hideWidget(name) {
  Store.patch(d => { d.ui.widgets[name] = { ...d.ui.widgets[name], on: false }; });
  buildDashboard();
  toast('в архиве — вернуть на полке «+» ♡');
}

function toggleCollapse(name) {
  Store.patch(d => {
    const c = d.ui.widgets[name];
    if (!c.collapsed) { c.restoreH = c.h; c.collapsed = true; }
    else { c.collapsed = false; if (c.restoreH) c.h = c.restoreH; }
  });
  buildDashboard();
}

function closeCtx() { document.querySelectorAll('.ctx-menu').forEach(x => x.remove()); }

function widgetMenu(x, y, name) {
  closeCtx();
  const m = el('div', 'ctx-menu');
  const cfg = Store.data.ui.widgets[name];

  m.innerHTML = '<div class="ctx-label">цвет этой карточки ♡</div>';
  const row = el('div', 'ctx-colors');
  for (const color of WIDGET_COLORS) {
    const d = el('span', 'ctx-dot');
    d.style.background = color;
    if (cfg.color === color) d.classList.add('active');
    d.onclick = () => {
      Store.patch(dd => { dd.ui.widgets[name] = { ...dd.ui.widgets[name], color }; });
      closeCtx(); buildDashboard();
    };
    row.appendChild(d);
  }
  const auto = el('span', 'ctx-dot ctx-dot-auto');
  auto.title = 'как у всех';
  if (!cfg.color) auto.classList.add('active');
  auto.onclick = () => {
    Store.patch(dd => { dd.ui.widgets[name] = { ...dd.ui.widgets[name], color: null }; });
    closeCtx(); buildDashboard();
  };
  row.appendChild(auto);
  m.appendChild(row);

  const item = (label, fn) => {
    const it = el('div', 'ctx-item', label);
    it.onclick = () => { closeCtx(); fn(); };
    m.appendChild(it);
  };
  item(cfg.collapsed ? 'развернуть' : 'свернуть', () => toggleCollapse(name));
  item('сбросить размер и место', () => {
    Store.patch(d => { d.ui.widgets[name] = { ...d.ui.widgets[name], x: null, y: null, w: 360, h: 300 }; });
    buildDashboard();
  });
  item('в архив', () => hideWidget(name));

  document.body.appendChild(m);
  const mw = m.offsetWidth, mh = m.offsetHeight;
  m.style.left = Math.min(x, window.innerWidth - mw - 12) + 'px';
  m.style.top = Math.min(y, window.innerHeight - mh - 12) + 'px';
  setTimeout(() => document.addEventListener('pointerdown', closeCtx, { once: true }), 0);
}

function enableWinDrag(win, name, head) {
  head.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.widget-ctl')) return;
    bringFront(win);
    const sx = e.clientX, sy = e.clientY;
    const cfg = Store.data.ui.widgets[name];
    const ox = cfg.x, oy = cfg.y;
    let px = ox, py = oy, moving = false;

    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moving && Math.abs(dx) + Math.abs(dy) < 4) return;
      moving = true;
      const dash = document.getElementById('dashboard');
      px = Math.max(-cfg.w + 150, Math.min(ox + dx, dash.clientWidth - 80));
      py = Math.max(0, Math.min(oy + dy, dash.clientHeight - 56));
      win.style.left = px + 'px';
      win.style.top = py + 'px';
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moving) Store.patch(d => { Object.assign(d.ui.widgets[name], { x: px, y: py }); });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function enableWinResize(win, name, grip) {
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    bringFront(win);
    const cfg = Store.data.ui.widgets[name];
    const sx = e.clientX, sy = e.clientY;
    const w0 = cfg.w || 360, h0 = cfg.h || 300;
    let pw = w0, ph = h0;
    win.classList.add('resizing');

    const move = (ev) => {
      pw = Math.max(WIN_MIN_W, w0 + (ev.clientX - sx));
      ph = Math.max(WIN_MIN_H, h0 + (ev.clientY - sy));
      win.style.width = pw + 'px';
      win.style.height = ph + 'px';
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      win.classList.remove('resizing');
      Store.patch(d => { Object.assign(d.ui.widgets[name], { w: pw, h: ph }); });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function clampWins() {
  const dash = document.getElementById('dashboard');
  document.querySelectorAll('.widget').forEach(w => {
    const cfg = Store.data.ui.widgets[w.dataset.widget];
    if (!cfg || cfg.collapsed) return;
    if (cfg.x + 80 > dash.clientWidth || cfg.y + 56 > dash.clientHeight) {
      cfg.x = Math.max(18, Math.min(cfg.x, dash.clientWidth - 320));
      cfg.y = Math.max(0, Math.min(cfg.y, dash.clientHeight - 200));
      placeWin(w, cfg);
      Store.patch(d => { Object.assign(d.ui.widgets[w.dataset.widget], { x: cfg.x, y: cfg.y }); });
    }
  });
}

function buildDashboard() {
  const dash = document.getElementById('dashboard');
  dash.innerHTML = '';
  const defs = Store.data.ui.widgets;
  const names = Object.keys(defs).filter(n => defs[n].on !== false).sort((a, b) => (defs[a].order || 0) - (defs[b].order || 0));

  const W = Math.max(320, dash.clientWidth - 36);
  const H = Math.max(300, dash.clientHeight - 24);
  const lanes = Math.max(1, Math.min(4, Math.floor(W / 350)));
  const laneW = W / lanes;
  const laneY = new Array(lanes).fill(14);
  winZ = 100;

  names.forEach((name, idx) => {
    const def = Widgets[name];
    if (!def) return;
    const cfg = defs[name];

    if (cfg.x == null) {
      const lane = idx % lanes;
      cfg.w = Math.max(WIN_MIN_W, Math.round(laneW) - 30);
      cfg.h = cfg.size === 's' ? 200 : cfg.size === 'l' ? 430 : 300;
      cfg.x = Math.round(18 + lane * laneW + 12);
      cfg.y = Math.min(laneY[lane], Math.max(14, H - 210));
      laneY[lane] += cfg.h + 18;
      Store.patch(d => { Object.assign(d.ui.widgets[name], { x: cfg.x, y: cfg.y, w: cfg.w, h: cfg.h }); });
    }

    const collapsed = !!cfg.collapsed;
    const w = el('div', 'widget' + (collapsed ? ' collapsed' : ''));
    w.dataset.widget = name;
    placeWin(w, cfg, collapsed);
    w.style.zIndex = ++winZ;
    if (cfg.color) w.style.setProperty('--card-accent', cfg.color);

    const head = el('div', 'widget-head');
    head.innerHTML = '<span class="widget-title">' + esc(def.title) + '</span>';
    const ctl = el('div', 'widget-ctl');
    const mkBtn = (txt, title, fn) => {
      const b = document.createElement('button');
      b.textContent = txt; b.title = title; b.onclick = fn;
      return b;
    };
    ctl.appendChild(mkBtn('♡', 'цвет карточки', (ev) => {
      const r = ev.target.getBoundingClientRect();
      widgetMenu(r.left - 60, r.bottom + 6, name);
    }));
    ctl.appendChild(mkBtn('×', 'в архив (двойной клик по шапке — свернуть)', () => hideWidget(name)));
    head.appendChild(ctl);

    head.addEventListener('dblclick', () => toggleCollapse(name));
    head.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      widgetMenu(e.clientX, e.clientY, name);
    });
    w.appendChild(head);

    const body = el('div', 'widget-body');
    w.appendChild(body);
    if (!collapsed) {
      try { def.render(body, CTX); }
      catch (e) { body.innerHTML = '<div class="anki-status">виджет покашлял: ' + esc(String(e)) + '</div>'; }
    }

    const grip = el('div', 'resize-grip');
    grip.title = 'тяни в любую сторону';
    enableWinResize(w, name, grip);
    w.appendChild(grip);

    enableWinDrag(w, name, head);
    dash.appendChild(w);
  });
}

/* ---------- полка «+» ---------- */
function openShelf() {
  const defs = Store.data.ui.widgets;
  const box = el('div', 'shelf');
  box.innerHTML = '<h2>полка виджетов ♡</h2>';

  const mkSection = (title, present, addLabel) => {
    const sec = el('div', 'shelf-sec');
    sec.innerHTML = '<div class="shelf-sec-title">' + title + '</div>';
    const grid = el('div', 'shelf-grid');
    let any = false;
    for (const [name, def] of Object.entries(Widgets)) {
      const on = defs[name] && defs[name].on !== false;
      if (present !== on) continue;
      any = true;
      const meta = WIDGET_META[name] || { icon: '✧', desc: '' };
      const card = el('div', 'shelf-card');
      card.innerHTML =
        '<div class="shelf-icon">' + meta.icon + '</div>' +
        '<div class="shelf-name">' + esc(def.title) + '</div>' +
        '<div class="shelf-desc">' + esc(meta.desc) + '</div>';
      const b = el('button', 'btn outline mini', present ? 'на столе ✓' : addLabel);
      if (present) {
        b.disabled = true;
        card.appendChild(b);
        const off = el('button', 'btn outline mini', 'в архив');
        off.onclick = () => { hideWidget(name); openShelf(); };
        card.appendChild(off);
      } else {
        b.onclick = () => {
          Store.patch(d => {
            if (!d.ui.widgets[name]) d.ui.widgets[name] = { on: true, size: 'm', order: Object.keys(d.ui.widgets).length };
            else d.ui.widgets[name] = { ...d.ui.widgets[name], on: true, x: null, y: null };
          });
          buildDashboard();
          openShelf();
        };
        card.appendChild(b);
      }
      grid.appendChild(card);
    }
    if (!any) sec.insertAdjacentHTML('beforeend', '<div class="muted shelf-empty">пусто — всё на столе ♡</div>');
    sec.appendChild(grid);
    box.appendChild(sec);
  };

  mkSection('на столе', true);
  mkSection('архив', false, 'вернуть на стол');
  openModal(box);
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
<span id="s-palettes" class="row" style="gap:6px"></span>
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

    <div class="field">телефон ♡ (Android, та же Wi-Fi)
      <div class="row">
        <label style="font-size:13px"><input type="checkbox" id="s-lan-on" ${s.lan && s.lan.enabled !== false ? 'checked' : ''}> включить</label>
        <button class="btn outline mini" id="s-lan-show">показать ссылку</button>
      </div>
      <div id="s-lan-urls" style="font-size:12px;color:var(--accent);margin-top:6px;word-break:break-all"></div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">открой ссылку в Chrome на телефоне → меню → «Добавить на главный экран» → будет иконка как у приложения</div>
    </div>

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

  const THEMES = [
    ['theme-coquette', '#f9cfdd', 'coquette'],
    ['theme-neutral', '#ecd9c3', 'беж'],
    ['theme-butter', '#f6e3b4', 'баттер'],
    ['theme-peach', '#f6c4b0', 'персик'],
    ['theme-lavender', '#d9cdee', 'лаванда'],
    ['theme-mint', '#c2e3cf', 'мята'],
    ['theme-darkpink', '#3a2440', 'ночь'],
    ['theme-egirl', '#241a28', 'e-girl']
  ];
  const pal = box.querySelector('#s-palettes');
  for (const [th, col, label] of THEMES) {
    const dot = document.createElement('span');
    dot.className = 'theme-dot ' + th + (ui.theme === th ? ' active' : '');
    dot.title = label; dot.dataset.th = th; dot.style.background = col;
    dot.onclick = () => {
      pal.querySelectorAll('.theme-dot').forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      Store.patch(d => { d.ui.theme = th; });
      applyUi();
    };
    pal.appendChild(dot);
  }
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
  box.querySelector('#s-lan-show').onclick = async () => {
    const info = await window.sp.lanInfo();
    box.querySelector('#s-lan-urls').innerHTML = info.enabled
      ? (info.urls.length ? info.urls.map(u => '🔗 ' + esc(u)).join('<br>') : 'Wi-Fi адрес не найден — включи ноут в Wi-Fi и запусти sp')
      : 'мост выключен — поставь галочку и сохрани';
  };
  box.querySelector('#s-lan-on').onchange = () => {};
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
      d.settings.lan = Object.assign({}, d.settings.lan || {}, { enabled: box.querySelector('#s-lan-on').checked });
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
    window.sp.lanRestart();
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
  document.getElementById('btn-shelf').onclick = openShelf;
  document.getElementById('btn-walls').onclick = Walls.open;
  window.addEventListener('resize', clampWins);

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

  window.sp.onExternal(() => {
    Store.load().then(() => {
      applyUi();
      buildDashboard();
      toast('обновилось с телефона/ноута ♡');
    });
  });

  window.sp.notify('sp проснулась ♡', 'sweet spot готов улаживать твой день');
}

document.addEventListener('DOMContentLoaded', boot);
