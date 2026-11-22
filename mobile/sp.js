/* sp — телефонный клиент */
const KEY = new URLSearchParams(location.search).get('k') || localStorage.getItem('spkey') || '';
if (KEY) localStorage.setItem('spkey', KEY);
const API = (p) => p + '?k=' + encodeURIComponent(KEY);

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function durText(min) {
  const m = Math.round(min);
  if (m < 60) return m + 'м';
  return Math.floor(m / 60) + 'ч' + (m % 60 ? String(m % 60).padStart(2, '0') + 'м' : '');
}

async function getState() {
  const r = await fetch(API('/api/state'));
  if (!r.ok) throw new Error('state');
  return r.json();
}

function renderClock() {
  const n = new Date();
  document.getElementById('clock').textContent =
    n.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function renderGreet(name) {
  const h = new Date().getHours();
  let g;
  if (h < 5) g = 'глубокая ночь… сон, ' + name;
  else if (h < 12) g = 'доброе утро, ' + name + ' ♡';
  else if (h < 17) g = 'продуктивного дня, ' + name + ' ♡';
  else if (h < 22) g = 'мягкий вечер, ' + name + ' ♡';
  else g = 'пора отдыхать, ' + name + ' ♡';
  document.getElementById('greet').textContent = g;
}

function renderPlan(plan, done) {
  const box = document.getElementById('plan');
  if (!plan || !plan.length) { box.innerHTML = '<div class="offline">плана пока нет — собери его на ноуте ✨</div>'; return; }
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  box.innerHTML = '';
  for (const b of plan) {
    if (!/task|overflow|warm|desire|busy/.test(b.type)) continue;
    if (b.type !== 'overflow' && b.end < nowMin - 30) continue;
    const row = document.createElement('div');
    const isTask = b.type === 'task';
    row.className = 'plan-block ' + b.type + (isTask && done[b.taskId + '@' + todayStr()] ? ' done' : '');
    const icon = b.type === 'warm' ? '🧘 ' : b.type === 'desire' ? '🌸 ' : b.type === 'busy' ? '🏫 ' : '';
    row.innerHTML =
      '<span class="t">' + esc(String(b.start).padStart(2, '0')) + '–' + esc(String(b.end).padStart(2, '0')) + '</span>' +
      '<span class="name">' + icon + esc(b.title) + '</span>';
    if (isTask) row.onclick = () => toggleTask(b.taskId);
    box.appendChild(row);
  }
}

function renderTasks(tasks, done) {
  const box = document.getElementById('tasks');
  box.innerHTML = '';
  for (const t of tasks) {
    const row = document.createElement('div');
    row.className = 'task-row' + (t.done ? ' done' : '');
    row.innerHTML =
      '<input type="checkbox" ' + (t.done ? 'checked' : '') + '>' +
      '<span class="task-title">' + esc(t.title) + '</span>' +
      (t.deadline ? '<span class="task-meta">' + esc(t.deadline.slice(5)) + '</span>' : '');
    row.querySelector('input').onchange = () => toggleTask(t.id);
    box.appendChild(row);
  }
  if (!tasks.length) box.innerHTML = '<div class="task-meta">задач нет, ты свободна ♡</div>';
}

function renderNotes(notes) {
  const box = document.getElementById('notes');
  box.innerHTML = notes.length
    ? notes.map(n => '<div class="note-card">' + esc(n.text) + '</div>').join('')
    : '<div class="task-meta">пока тихо</div>';
}

async function renderAnki() {
  const box = document.getElementById('anki');
  try {
    const r = await fetch(API('/api/anki-due'));
    const j = await r.json();
    if (!j.online) { box.innerHTML = 'anki на ноуте не открыт'; return; }
    const total = j.decks.reduce((a, d) => a + d.due, 0);
    box.innerHTML = total
      ? '<b style="color:var(--accent)">' + total + ' карточек</b> ждут тебя: ' + esc(j.decks.slice(0, 3).map(d => d.name).join(', '))
      : 'всё повторено, умница ♡';
  } catch (e) {
    box.innerHTML = 'anki недоступен';
  }
}

async function toggleTask(id) {
  await fetch(API('/api/task-toggle'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId: id, date: todayStr() })
  });
  refresh();
}

document.getElementById('btn-add').onclick = async () => {
  const inp = document.getElementById('new-task');
  const title = inp.value.trim();
  if (!title) return;
  await fetch(API('/api/task-add'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title })
  });
  inp.value = '';
  refresh();
};

let refreshTimer = null;
async function refresh() {
  try {
    const d = await getState();
    renderGreet(d.name);
    renderPlan(d.plan, d.planDone || {});
    renderTasks(d.tasks, d.planDone || {});
    renderNotes(d.notes || []);
    renderAnki();
  } catch (e) {
    document.getElementById('plan').innerHTML =
      '<div class="offline">ноут не отвечает.<br>sp запущена на ноуте и вы в той же Wi-Fi? ♡</div>';
  }
}
refresh();
refreshTimer = setInterval(refresh, 20000);
setInterval(renderClock, 15000);
renderClock();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
