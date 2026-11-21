/* ================= sp — виджеты ================= */
const Widgets = {};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function ruWeekday(d) { return ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()]; }
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* ---------- часы ---------- */
Widgets.clock = {
  title: 'время ♡',
  render(body, ctx) {
    body.innerHTML = `
      <div class="big-clock">
        <div class="time"></div>
        <div class="date"></div>
        <div class="greet"></div>
      </div>`;
    const q = sel => body.querySelector(sel);
    Widgets.clock.tick = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const name = esc(Store.data.profile.name || 'girl');
      q('.time').textContent = hh + ':' + mm;
      q('.date').textContent = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
      let g;
      if (now.getHours() < 5) g = 'глубокая ночь, '+name+'… сон?';
      else if (now.getHours() < 12) g = 'доброе утро, ' + name + ' ♡';
      else if (now.getHours() < 17) g = 'продуктивного дня, ' + name + ' ♡';
      else if (now.getHours() < 22) g = 'мягкий вечер, ' + name + ' ♡';
      else g = 'пора отдыхать, ' + name + ' ♡';
      q('.greet').textContent = g;
    };
    Widgets.clock.tick();
  },
  tick() { if (Widgets.clock.tick) Widgets.clock.tick(); }
};

/* ---------- планировщик ---------- */
Widgets.planner = {
  title: 'план на сегодня',
  render(body, ctx) {
    body.innerHTML = `
      <div class="row" style="margin-bottom:8px">
        <button class="btn mini act-replan">собрать план ✨</button>
        <span class="plan-stats muted" style="font-size:12px;color:var(--muted)"></span>
      </div>
      <div class="plan-list"></div>`;
    body.querySelector('.act-replan').onclick = () => ctx.replan(true);
    Widgets.planner.refresh = (blocks) => {
      if (!blocks) return;
      const list = body.querySelector('.plan-list');
      list.innerHTML = '';
      const st = planStats(blocks);
      body.querySelector('.plan-stats').textContent =
        durText(st.task) + ' учёбы · ' + durText(st.desire) + ' желаний · ' + durText(st.busy) + ' уроков';
      for (const b of blocks) {
        const row = el('div', 'plan-block ' + b.type);
        const label = b.type === 'warm' ? '🧘 ' : b.type === 'desire' ? '🌸 ' : '';
        row.innerHTML =
          '<span class="t">' + esc(minToHm(b.start)) + '–' + esc(minToHm(b.end)) + '</span>' +
          '<span class="name">' + label + esc(b.title) + '</span>';
        if (b.type === 'task') {
          row.classList.toggle('done', !!Store.data.planDone[b.taskId + '@' + todayStr()]);
          row.onclick = () => {
            const key = b.taskId + '@' + todayStr();
            const dn = Store.data.planDone;
            if (dn[key]) delete dn[key]; else dn[key] = true;
            Store.patch(() => {});
            ctx.renderAll('planner');
            ctx.renderAll('tasks');
          };
        }
        list.appendChild(row);
      }
    };
    if (Store.data.plan) Widgets.planner.refresh(Store.data.plan);
  },
  refresh: null
};

/* ---------- задачи ---------- */
Widgets.tasks = {
  title: 'задачи',
  render(body, ctx) {
    body.innerHTML = `
      <div class="row" style="margin-bottom:8px">
        <input class="t-title" placeholder="что сделать?" style="flex:1;min-width:120px">
        <input class="t-when" type="date" style="width:138px">
        <select class="t-subj" style="width:120px"></select>
        <button class="btn mini act-add">+ ♡</button>
      </div>
      <div class="t-list"></div>`;
    const q = s => body.querySelector(s);
    for (const s of Store.data.settings.subjects) {
      q('.t-subj').insertAdjacentHTML('beforeend', '<option>' + esc(s) + '</option>');
    }
    q('.t-subj').insertAdjacentHTML('beforeend', '<option value="">— без предмета</option>');
    q('.act-add').onclick = () => {
      const title = q('.t-title').value.trim();
      if (!title) return;
      Store.patch(d => d.tasks.unshift({
        id: 't' + Date.now() + Math.floor(Math.random() * 999),
        title,
        subject: q('.t-subj').value || null,
        deadline: q('.t-when').value || null,
        effortMin: 30,
        priority: /кр|соч|сор|экзам/i.test(title) ? 3 : 1,
        energy: /повтор|прочит|легк/i.test(title) ? 'low' : 'high',
        done: false,
        created: todayStr()
      }));
      q('.t-title').value = '';
      ctx.renderAll('tasks');
      ctx.replan(false);
    };
    Widgets.tasks.refresh = () => {
      const list = q('.t-list');
      list.innerHTML = '';
      const tasks = Store.data.tasks.slice().sort((a, b) => (
        (a.done === b.done) ? ((a.deadline || '9999') < (b.deadline || '9999') ? -1 : 1) : (a.done ? 1 : -1)
      ));
      for (const t of tasks) {
        const row = el('div', 'task-row' + (t.done ? ' done' : ''));
        const dl = t.deadline
          ? (t.deadline < todayStr() ? '<span style="color:var(--bad)">🔥</span> ' : '') + t.deadline.slice(5)
          : '';
        row.innerHTML =
          '<input type="checkbox" ' + (t.done ? 'checked' : '') + '>' +
          '<span class="task-title">' + (t.subject ? '<span class="badge">' + esc(t.subject) + '</span>' : '') + esc(t.title) + '</span>' +
          (dl ? '<span class="task-meta">' + dl + '</span>' : '') +
          '<button class="del">×</button>';
        row.querySelector('input').onchange = () => {
          t.done = !t.done;
          Store.patch(() => {});
          ctx.renderAll('tasks');
          ctx.renderAll('planner');
        };
        row.querySelector('.del').onclick = () => {
          Store.data.tasks = Store.data.tasks.filter(x => x.id !== t.id);
          Store.patch(() => {});
          ctx.renderAll('tasks');
        };
        list.appendChild(row);
      }
    };
    Widgets.tasks.refresh();
  },
  refresh: null
};

/* ---------- помойка-вход ---------- */
Widgets.inbox = {
  title: 'помойка-вход 💌',
  render(body, ctx) {
    body.innerHTML = `
      <textarea class="in-dump" rows="3" placeholder="кидай как попало: ср по химии ср 19:00, сочинение в пятницу, созвон в тг…"
        style="width:100%;resize:vertical"></textarea>
      <div class="row" style="margin-top:6px">
        <button class="btn mini act-parse">разобрать ✧</button>
        <span class="in-note" style="font-size:11px;color:var(--muted)"></span>
      </div>
      <div class="in-list" style="margin-top:8px"></div>`;
    const q = s => body.querySelector(s);
    q('.act-parse').onclick = async () => {
      const raw = q('.in-dump').value;
      if (!raw.trim()) return;
      const entries = parseDump(raw, { source: 'typo' });
      const llm = Store.data.settings.llm;
      if (llm.key) {
        for (const en of entries) await llmEnhance(en, llm);
        q('.in-note').textContent = 'нейронка помогла ✧';
      } else {
        q('.in-note').textContent = 'эвристики (без ключа)';
      }
      Store.patch(d => d.inbox.unshift(...entries));
      q('.in-dump').value = '';
      ctx.renderAll('inbox');
    };
    Widgets.inbox.refresh = () => {
      const list = q('.in-list');
      list.innerHTML = '';
      for (const e of Store.data.inbox.slice(0, 12)) {
        const row = el('div', 'inbox-entry');
        row.innerHTML =
          '<span class="meta">' +
          (e.subject ? '<span class="badge">' + esc(e.subject) + '</span>' : '') +
          (e.tag ? '<span class="badge">' + esc(e.tag) + '</span>' : '') +
          (e.deadline ? '📅 ' + esc(e.deadline.slice(5)) : '') + ' ' +
          (e.time ? '⏰ ' + esc(e.time) : '') +
          '</span>' +
          '<div>' + esc(e.title) + '</div>';
        const btn = el('button', 'btn outline mini', 'в задачи →');
        btn.style.marginTop = '6px';
        btn.onclick = () => {
          Store.patch(d => {
            d.inbox = d.inbox.filter(x => x.id !== e.id);
            d.tasks.unshift({
              id: 't' + Date.now(), title: e.title, subject: e.subject,
              deadline: e.deadline, effortMin: e.effortMin || 30,
              priority: e.tag === 'КР/СОЧ' ? 3 : 1,
              energy: e.tag === 'КР/СОЧ' ? 'high' : 'low',
              done: false, created: todayStr()
            });
          });
          ctx.renderAll('inbox');
          ctx.renderAll('tasks');
          ctx.replan(false);
          ctx.toast('переехало в задачи ♡');
        };
        row.appendChild(btn);
        list.appendChild(row);
      }
    };
    Widgets.inbox.refresh();
  },
  refresh: null
};

/* ---------- заметки ---------- */
Widgets.notes = {
  title: 'стикеры',
  render(body, ctx) {
    body.innerHTML = `
      <div class="row" style="margin-bottom:8px">
        <input class="n-add" placeholder="быстрая мысль…" style="flex:1;min-width:100px">
        <button class="btn mini act-n">+ ♡</button>
      </div>
      <div class="n-list"></div>`;
    const q = s => body.querySelector(s);
    const add = () => {
      const v = q('.n-add').value.trim();
      if (!v) return;
      Store.patch(d => d.notes.unshift({ id: 'n' + Date.now(), text: v, date: todayStr() }));
      q('.n-add').value = '';
      Widgets.notes.refresh();
    };
    q('.act-n').onclick = add;
    q('.n-add').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    Widgets.notes.refresh = () => {
      const list = q('.n-list');
      list.innerHTML = '';
      for (const n of Store.data.notes.slice(0, 20)) {
        const c = el('div', 'note-card', esc(n.text) +
          '<div style="font-size:11px;color:var(--muted);margin-top:4px">' + n.date + '</div>');
        c.onclick = () => {
          Store.data.notes = Store.data.notes.filter(x => x.id !== n.id);
          Store.patch(() => {});
          Widgets.notes.refresh();
        };
        list.appendChild(c);
      }
    };
    Widgets.notes.refresh();
  },
  refresh: null
};

/* ---------- музыка ---------- */
Widgets.player = {
  title: 'плеер 🎧',
  render(body, ctx) {
    body.innerHTML = `
      <div class="row">
        <button class="btn outline mini act-files">+ файлы</button>
        <button class="btn outline mini act-url">↓ плейлист по ссылке</button>
        <span class="yd-status" style="font-size:11px;color:var(--muted)"></span>
      </div>
      <div class="player-now"></div>
      <input type="range" class="p-seek" min="0" max="100" value="0">
      <div class="row">
        <button class="ghost-btn p-prev">⏮</button>
        <button class="btn p-play">▶</button>
        <button class="ghost-btn p-next">⏭</button>
        <input type="range" class="p-vol" min="0" max="100" value="80" style="max-width:110px">
        <label style="font-size:12px"><input type="checkbox" class="p-shuffle"> вперемешку</label>
      </div>
      <div class="player-tracklist" style="margin-top:8px"></div>`;
    const q = s => body.querySelector(s);
    const audio = document.getElementById('player-audio');
    const loc = Store.data.settings;

    const ensureFolder = async () => {
      if (loc.musicFolder) return loc.musicFolder;
      const folder = await window.sp.pickFolder();
      if (folder) { Store.patch(d => { d.settings.musicFolder = folder; }); }
      return folder || null;
    };

    q('.act-files').onclick = async () => {
      const files = await window.sp.pickAudio();
      if (!files.length) return;
      Store.patch(d => {
        for (const f of files) {
          const name = f.split(/[\\/]/).pop();
          if (!d.tracks) d.tracks = [];
          if (!d.tracks.find(t => t.path === f)) d.tracks.push({ path: f, name });
        }
      });
      Widgets.player.refresh();
    };
    q('.act-url').onclick = async () => {
      const url = prompt('Ссылка на плейлист/трек (YouTube):');
      if (!url) return;
      const folder = await ensureFolder();
      if (!folder) return ctx.toast('сначала выбери папку для музыки ♡');
      q('.yd-status').textContent = 'качается… это может занять пару минут';
      const r = await window.sp.ytdlp.download(url, folder);
      q('.yd-status').textContent = r.ok ? 'готово ♡ файлы в папке' : ('упс: ' + (r.error || '').slice(0, 80));
      if (r.ok) window.sp.ytdlp.check().then(v => { if (v) ytdlpReady(); });
    };
    const ytdlpReady = async () => {
      const v = await window.sp.ytdlp.check();
      q('.yd-status').textContent = v ? 'yt-dlp: ' + v : 'yt-dlp не установлен (для ссылок поставь его)';
    };
    ytdlpReady();

    const pickTrack = (i) => {
      const tracks = Store.data.tracks || [];
      if (!tracks.length) { q('.player-now').textContent = 'библиотека пуста — добавь файлы ♡'; return; }
      Widgets.player.idx = ((i % tracks.length) + tracks.length) % tracks.length;
      const t = tracks[Widgets.player.idx];
      audio.src = 'file:///' + t.path.replace(/\\/g, '/');
      audio.play();
      q('.player-now').textContent = '🎧 ' + t.name;
      Widgets.player.refresh();
    };
    q('.p-play').onclick = () => {
      if (!audio.src) return pickTrack(Widgets.player.idx || 0);
      audio.paused ? audio.play() : audio.pause();
      q('.p-play').textContent = audio.paused ? '▶' : '⏸';
    };
    q('.p-next').onclick = () => pickTrack((Widgets.player.idx || 0) + 1);
    q('.p-prev').onclick = () => pickTrack((Widgets.player.idx || 0) - 1);
    q('.p-vol').oninput = e => { audio.volume = e.target.value / 100; };
    audio.ontimeupdate = () => {
      if (audio.duration) q('.p-seek').value = Math.round(100 * audio.currentTime / audio.duration);
    };
    q('.p-seek').onchange = e => { if (audio.duration) audio.currentTime = e.target.value / 100 * audio.duration; };
    audio.onended = () => {
      const sh = q('.p-shuffle').checked;
      const n = (Store.data.tracks || []).length;
      pickTrack(sh ? Math.floor(Math.random() * n) : (Widgets.player.idx || 0) + 1);
    };

    Widgets.player.refresh = () => {
      const list = q('.player-tracklist');
      if (!list) return;
      list.innerHTML = '';
      (Store.data.tracks || []).forEach((t, i) => {
        const row = el('div', 'player-track' + (i === Widgets.player.idx ? ' active' : ''), esc(t.name));
        row.onclick = () => pickTrack(i);
        list.appendChild(row);
      });
    };
    Widgets.player.refresh();
    if (!Widgets.player.idx && (Store.data.tracks || []).length) Widgets.player.idx = 0;
  },
  idx: 0,
  refresh: null
};

/* ---------- калькулятор ---------- */
Widgets.calculator = {
  title: 'калькулятор',
  render(body, ctx) {
    body.innerHTML = `
      <input class="calc-display" placeholder="0">
      <div class="calc-grid"></div>`;
    const q = s => body.querySelector(s);
    const disp = q('.calc-display');
    const keys = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', 'C', '+', '√', '^', '%', '='];
    const grid = q('.calc-grid');
    for (const k of keys) {
      const b = document.createElement('button');
      b.textContent = k.replace('√', '√');
      if ('/*-+^%'.includes(k)) b.className = 'op';
      if (k === '=') b.className = 'eq';
      b.onclick = () => {
        if (k === 'C') { disp.value = ''; return; }
        if (k === '=') {
          try {
            const expr = disp.value.replace(/√/g, 'Math.sqrt').replace(/\^/g, '**').replace(/%/g, '/100');
            if (!/^[-+*/().\d\s*Mathrgtbcosinepq lt×]*$|^\s*[-+]?[\d.]/.test(expr)) throw 0;
            const val = Function('"use strict";return (' + expr.replace(/[^\d+\-*/().\sMathrgtbcosinelq%]/g, '') + ')')();
            disp.value = String(Math.round(val * 1e10) / 1e10);
          } catch (e) { disp.value = 'ай-ай ✧'; }
          return;
        }
        disp.value += k;
      };
      grid.appendChild(b);
    }
    disp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        try {
          const expr = disp.value.replace(/√/g, 'Math.sqrt').replace(/\^/g, '**');
          disp.value = String(Math.round(Function('"use strict";return (' + expr.replace(/[^\d+\-*/().\sMathrgtbcosinelq%]/g, '') + ')')() * 1e10) / 1e10);
        } catch (err) { disp.value = 'ай-ай ✧'; }
        e.preventDefault();
      }
    });
  }
};

/* ---------- anki ---------- */
Widgets.anki = {
  title: 'anki ♡',
  render(body, ctx) {
    body.innerHTML = `
      <div class="anki-status" style="font-size:13px;color:var(--muted)">ищу AnkiConnect на localhost:8765…</div>
      <div class="anki-list" style="margin-top:6px"></div>
      <div class="row" style="margin-top:8px">
        <button class="btn mini act-review hidden">повторить ◌</button>
        <span class="anki-hint" style="font-size:11px;color:var(--muted)">нужен открытый Anki + плагин AnkiConnect (2055492159)</span>
      </div>
      <div class="reviewer hidden" style="margin-top:10px"></div>`;
    const q = s => body.querySelector(s);
    const call = async (action, params) => {
      const r = await window.sp.http('http://127.0.0.1:8765', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, version: 6, params: params || {} })
      });
      if (!r.ok) throw new Error('anki offline');
      const j = JSON.parse(r.text);
      if (j.error) throw new Error(j.error);
      return j.result;
    };

    const load = async () => {
      try {
        const decks = await call('deckNames');
        const stats = await call('getDeckStats', { decks });
        Store.data.ankiCache = { at: Date.now(), stats };
        Store.patch(() => {});
        const list = q('.anki-list');
        list.innerHTML = '';
        let totalDue = 0;
        const rows = Object.values(stats).filter(x => x.name !== 'Default')
          .filter(x => x.new_count + x.learn_count + x.review_count > 0)
          .sort((a, b) => (b.due_count - a.due_count));
        for (const s of rows) {
          const due = s.new_count + s.learn_count + s.review_count;
          totalDue += due;
          list.insertAdjacentHTML('beforeend',
            '<div class="task-row"><span class="task-title">' + esc(s.name) + '</span>' +
            '<span class="task-meta">' + due + ' к повтору</span></div>');
        }
        if (!rows.length) list.innerHTML = '<div class="anki-status">всё повторено, ты умница ♡</div>';
        q('.anki-status').textContent = 'anki на связи ✧';
        const btn = q('.act-review');
        btn.classList.remove('hidden');
        btn.textContent = 'повторить (' + totalDue + ') ◌';
        btn.onclick = () => reviewer(decks.filter(d => rows.find(r => r.name === d)));
      } catch (err) {
        q('.anki-status').textContent = 'anki не отвечает — открой Anki и проверь плагин AnkiConnect';
      }
    };
    load();

    const reviewer = async (decks) => {
      const box = q('.reviewer');
      box.classList.remove('hidden');
      deckLoop:
      for (const deck of decks) {
        try {
          const ids = await call('findCards', { query: 'deck:"' + deck + '" is:due' });
          for (const cid of ids) {
            void cid;
          }
          if (!ids.length) continue;
          /* показываем по одной */
          for (let i = 0; i < Math.min(ids.length, 10); i++) {
            const info = (await call('cardsInfo', { cards: [ids[i]] }))[0];
            const front = info.fields[Object.keys(info.fields)[0]].value;
            const back = info.fields[Object.keys(info.fields)[1]].value;
            await new Promise(resolve => {
              box.innerHTML =
                '<div class="note-card"><b>вопрос</b><br>' + esc(front) + '</div>' +
                '<button class="btn mini show-ansbk">показать ответ</button>';
              box.querySelector('.show-ansbk').onclick = () => {
                box.innerHTML =
                  '<div class="note-card">' + esc(front) + '</div>' +
                  '<div class="note-card" style="background:color-mix(in srgb, var(--good) 12%, var(--card-soft))">' + esc(back) + '</div>' +
                  '<div class="row"><button class="btn outline mini a1">сложно</button>' +
                  '<button class="btn a2">знаю</button></div>';
                box.querySelector('.a1').onclick = () => { call('answerCards', { cards: [ids[i]], ease: 1 }); resolve(); };
                box.querySelector('.a2').onclick = () => { call('answerCards', { cards: [ids[i]], ease: 3 }); resolve(); };
              };
            });
          }
          break deckLoop;
        } catch (e) { break deckLoop; }
      }
      box.classList.add('hidden');
      load();
    };
  }
};

/* ---------- фокус-страж ---------- */
Widgets.focus = {
  title: 'фокус-страж 🛡',
  render(body, ctx) {
    body.innerHTML = `
      <div class="f-status" style="font-size:13px;margin-bottom:6px">сессия не запущена</div>
      <div class="row">
        <select class="f-min" style="width:90px">
          <option value="15">15 мин</option><option value="25">25 мин</option>
          <option value="45" selected>45 мин</option><option value="90">90 мин</option>
        </select>
        <button class="btn mini act-start">охраняй ♡</button>
        <button class="btn outline mini act-stop hidden">стоп</button>
      </div>
      <div class="f-vio" style="font-size:12px;color:var(--muted);margin-top:8px"></div>`;
    const q = s => body.querySelector(s);
    const refreshState = async () => {
      const st = await state();
      refreshUI(st);
    };
    async function state() { return null; }
    if (window.sp && window.sp.focus) {
      const get = () => window.sp.focus.state();
      refreshState = () => window.sp.focus.state().then(refreshUI);
    }
    function refreshUI(st) {
      if (st) {
        q('.f-status').textContent = 'охраняю с ' + new Date(st.startedAt).toLocaleTimeString('ru-RU') +
          ' · отвлечений: ' + st.violations.length + ' 💅';
        q('.act-start').classList.add('hidden');
        q('.act-stop').classList.remove('hidden');
        if (st.violations.length) {
          const last = st.violations[st.violations.length - 1];
          q('.f-vio').textContent = 'последняя утечка: ' + last.title;
        }
      } else {
        q('.f-status').textContent = 'сессия не запущена';
        q('.act-start').classList.remove('hidden');
        q('.act-stop').classList.add('hidden');
        q('.f-vio').textContent = '';
      }
    }
    q('.act-start').onclick = async () => {
      const wl = Store.data.settings.focus.whitelist.map(s => s.trim()).filter(Boolean);
      await window.sp.focus.start({ sessionMin: +q('.f-min').value, whitelist: wl });
      refreshState();
      ctx.toast('фокус-страж включён ♡ отвлекусь немного — просто предупрежу');
    };
    q('.act-stop').onclick = async () => {
      const r = await window.sp.focus.stop();
      if (r) {
        Store.patch(d => d.focusLog.push({ date: todayStr(), minutes: r.minutes, violations: r.violations.length }));
        ctx.toast('сессия ' + r.minutes + ' мин · отвлечений: ' + r.violations.length + ' ♡');
      }
      refreshState();
    };
    if (window.sp && window.sp.focus) {
      window.sp.focus.onViolation(() => refreshState());
    }
    refreshState();
  }
};
