/* ================= sp — планировщик =================
   Чистая математика: расписание-скелет + сон + энергия + дедлайны + желания.
   Никаких сетей, работает офлайн. */

function hmToMin(s) {
  const [h, m] = String(s || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function minToHm(m) {
  const t = ((Math.round(m) % 1440) + 1440) % 1440;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}
function durText(min) {
  const m = Math.round(min);
  if (m < 60) return m + 'м';
  return Math.floor(m / 60) + 'ч' + (m % 60 ? String(m % 60).padStart(2, '0') + 'м' : '');
}

/* energy уровень в минуте */
function energyAt(profile, min) {
  for (const p of profile || []) {
    if (min >= hmToMin(p.from) && min < hmToMin(p.to)) return p.level;
  }
  return 'mid';
}

/**
 * planDay — строит план дня.
 * @param cfg { wake, sleep, busy:[{start,end,title,type}], tasks:[{id,title,deadline,effortMin,priority,energy,subject}],
 *             desires:[{id,title,durationMin}], warmupOn, warmupIntervalMin, warmupLengthMin, energy:[...], nowMin }
 * @returns blocks [{start,end,type,title,taskId}] sorted
 */
function planDay(cfg) {
  const wake = hmToMin(cfg.wake || '07:30');
  const sleepAt = hmToMin(cfg.sleep || '23:00');
  const warmupOn = cfg.warmupOn !== false;
  const interval = Math.max(20, cfg.warmupIntervalMin || 60);
  const warmLen = Math.max(2, cfg.warmupLengthMin || 5);

  const busy = (cfg.busy || []).map(b => ({ ...b, startS: hmToMin(b.start), endS: hmToMin(b.end) }))
    .sort((a, b) => a.startS - b.startS);

  /* 1. свободные щели между busy */
  const gaps = [];
  let cursor = Math.max(wake, 0);
  for (const b of busy) {
    if (b.startS > cursor) gaps.push({ start: cursor, end: Math.min(b.startS, sleepAt) });
    cursor = Math.max(cursor, b.endS);
  }
  if (cursor < sleepAt) gaps.push({ start: cursor, end: sleepAt });
  for (const g of gaps) g.free = g.end - g.start;

  /* 2. разминки: каждые interval минут от пробуждения, если не внутри занятого блока */
  const warmups = [];
  if (warmupOn) {
    for (let t = wake + interval; t < sleepAt - 15; t += interval) {
      const insideBusy = busy.some(b => t >= b.startS - 5 && t < b.endS);
      if (!insideBusy) warmups.push({ start: t, end: t + warmLen });
    }
  }

  /* 3. вырезать зоны разминок из щелей и слить щели */
  const gaps2 = [];
  for (const g of gaps) {
    let cur = g.start;
    const inRange = warmups.filter(w => w.start < g.end && w.end > g.start);
    for (const w of inRange) {
      if (w.start > cur) gaps2.push({ start: cur, end: Math.min(w.start, g.end), free: Math.min(w.start, g.end) - cur });
      cur = Math.max(cur, w.end);
    }
    if (cur < g.end) gaps2.push({ start: cur, end: g.end, free: g.end - cur });
  }
  for (const g of gaps2) g.energyLevel = energyAt(cfg.energy, g.start);

  /* 4. задачи: дедлайн ближе → раньше; потом приоритет; внутри — сначала долгие */
  const nowMin = cfg.nowMin != null ? cfg.nowMin : null;
  const tasks = (cfg.tasks || []).filter(t => !t.done).slice();
  tasks.sort((a, b) => (
    (a.deadline || '9999') < (b.deadline || '9999') ? -1 :
    (a.deadline || '9999') > (b.deadline || '9999') ? 1 :
    (b.priority || 0) - (a.priority || 0) ||
    (b.effortMin || 30) - (a.effortMin || 30)
  ));

  const planned = [];
  const gapTk = gaps2.map(g => ({ ...g, used: 0 }));

  for (const task of tasks) {
    let need = Math.max(10, task.effortMin || 30);

    /* идём по щелям: сначала совпадение по энергии и не в прошлом */
    const order = gapTk
      .filter(g => g.free - (g.plannedMin || 0) > 14)
      .filter(g => nowMin == null || g.end > nowMin)
      .sort((a, b) => (
        (b.energyLevel === task.energy) - (a.energyLevel === task.energy) ||
        a.start - b.start
      ));

    for (const g of order) {
      if (need <= 0) break;
      const avail = g.free - (g.plannedMin || 0);
      if (avail < 14) continue;
      const take = Math.min(avail, need, 90); /* максимум 90 минут подряд */
      planned.push({
        start: g.start + (g.plannedMin || 0),
        end: g.start + (g.plannedMin || 0) + take,
        type: 'task',
        title: task.subject ? task.subject + ' · ' + task.title : task.title,
        taskId: task.id,
        energy: task.energy || 'mid'
      });
      g.plannedMin = (g.plannedMin || 0) + take;
      need -= take;
    }
    if (need > 0) {
      planned.push({
        start: -1, end: -1,
        type: 'overflow',
        title: '⚠ не влезло в день: ' + task.title + ' (' + durText(need) + ')',
        taskId: task.id
      });
    }
  }

  /* 5. желания — в оставшиеся широкие щели, ближе к вечеру */
  const desires = (cfg.desires || []).slice().sort((a, b) => (b.durationMin || 30) - (a.durationMin || 30));
  for (const d of desires) {
    const need = Math.max(10, d.durationMin || 30);
    const cand = gapTk
      .filter(g => g.free - (g.plannedMin || 0) >= need)
      .sort((a, b) => b.start - a.start); /* позже — лучше */
    if (!cand.length) continue;
    const g = cand[0];
    planned.push({
      start: g.start + (g.plannedMin || 0),
      end: g.start + (g.plannedMin || 0) + need,
      type: 'desire',
      title: (d.title || 'желание') + ' ♡',
      desireId: d.id
    });
    g.plannedMin = (g.plannedMin || 0) + need;
  }

  /* 6. сборка: busy + разминки + free остатки */
  const blocks = [];
  for (const b of busy) {
    blocks.push({ start: b.startS, end: b.endS, type: b.type || 'busy', title: b.title });
  }
  for (const w of warmups) blocks.push({ start: w.start, end: w.end, type: 'warm', title: 'разминка ♡' });
  blocks.push(...planned);
  for (const g of gapTk) {
    const left = g.free - (g.plannedMin || 0);
    if (left > 9) {
      blocks.push({ start: g.start + (g.plannedMin || 0), end: g.end, type: 'free', title: 'свободно' });
    }
  }

  blocks.sort((a, b) => a.start - b.start || a.end - b.end);
  return blocks.filter(b => b.type === 'overflow' || (b.end > 0 && b.end <= Math.max(wake, sleepAt) + 1440));
}

function planStats(blocks) {
  const s = { task: 0, desire: 0, warm: 0, free: 0, busy: 0, overflow: 0 };
  for (const b of blocks || []) s[b.type] = (s[b.type] || 0) + Math.max(0, b.end - b.start);
  return s;
}

if (typeof module !== 'undefined') {
  module.exports = { hmToMin, minToHm, durText, energyAt, planDay, planStats };
}
