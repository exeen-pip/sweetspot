/* ================= sp — edupage мост =================
   Тянет публичное расписание школы (aSc). Несколько форматов,
   с фоллбэком на ручной недельный шаблон. */

async function spFetch(url) {
  const r = await window.sp.http(url, {});
  return r.ok ? r.text : null;
}

/**
 * fetchTimetable(schoolUrl, classId) → {days:[{date,lessons:[{start,end,subject,room,teacher}]}]} | null
 */
async function fetchTimetable(schoolUrl, classId) {
  if (!schoolUrl) return null;
  const base = schoolUrl.replace(/\/+$/, '');

  /* путь 1: regulartt.js (aSc Timetables, открытые школы) */
  try {
    const js = await spFetch(base + '/timetable/server/regulartt.js?file=regulartt.js');
    if (js && js.length > 100) {
      const parsed = parseRegulartt(js, classId);
      if (parsed) return parsed;
    }
  } catch (e) { /* дальше */ }

  /* путь 2: страница расписания, встроенный JSON */
  try {
    const html = await spFetch(base + '/timetable/');
    if (html) {
      const parsed = parseEmbedded(html, classId);
      if (parsed) return parsed;
    }
  } catch (e) { /* дальше */ }

  return null;
}

function parseRegulartt(js, classId) {
  try {
    const m = js.match(/^\s*dbi\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (!m) return null;
    const dbi = JSON.parse(m[1]);
    if (!dbi || !dbi.classes || !dbi.classes.all_ids) return null;

    let cid = null;
    for (const id of dbi.classes.all_ids) {
      const row = dbi.classes.rows[id] || {};
      if (String(row.short || row.name || '').toLowerCase() === String(classId).toLowerCase()) cid = id;
    }
    if (cid == null) return null;

    const periods = dbi.periods && dbi.periods.rows;
    const daysdefs = dbi.daysdefs && dbi.daysdefs.all_ids;
    const cells = dbi._tt && dbi._tt[cid] ? dbi._tt[cid] : null;
    if (!periods || !daysdefs || !cells) return null;

    const result = [];
    daysdefs.forEach((dayId, di) => {
      const d = dbi.daysdefs.rows[dayId] || {};
      const dayCells = cells[di] || {};
      const lessons = [];
      for (const rid of Object.keys(dayCells)) {
        const cell = Array.isArray(dayCells[rid]) ? dayCells[rid][0] : dayCells[rid];
        const p = periods[rid] || {};
        if (!cell || !p) continue;
        const g = cell._g || cell;
        const subIds = g.subjects || [];
        const roomIds = g.classrooms || [];
        const teaIds = g.teachers || [];
        lessons.push({
          start: normTime(p.starttime || ''),
          end: normTime(p.endtime || ''),
          subject: subIds.length ? nameOf(dbi.subjects, subIds[0]) : (cell._s || ''),
          room: roomIds.length ? nameOf(dbi.classrooms, roomIds[0], 'short') : '',
          teacher: teaIds.length ? nameOf(dbi.teachers, teaIds[0], 'short') : ''
        });
      }
      lessons.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      result.push({ date: null, dayName: d.name || d.short || String(di + 1), lessons });
    });
    return { days: result, raw: {} };
  } catch (e) {
    return null;
  }
}

function nameOf(table, id, field) {
  if (!table || !table.rows) return '';
  const row = table.rows[id] || {};
  return row[field === 'short' ? 'short' : 'name'] || row.name || row.short || '';
}

/* резервный парсер: ищем JSON с учителями/предметами прямо в HTML */
function parseEmbedded(html, classId) {
  try {
    const m = html.match(/timetable\.data\s*=\s*(\{[\s\S]*?\});/) ||
              html.match(/"ttdata"\s*:\s*(\{[\s\S]*?\})\s*,\s*"/);
    if (!m) return null;
    const data = JSON.parse(m[1]);
    void classId;
    if (!data || !data.days) return null;
    return { days: data.days, raw: {} };
  } catch (e) {
    return null;
  }
}

/* преобразование в busy-блоки для планировщика */
function timetableToBusy(tt, weekdayIndex) {
  const out = [];
  if (!tt || !tt.days) return out;
  const day = tt.days[weekdayIndex];
  if (!day) return out;
  for (const l of day.lessons) {
    if (!l.start || !l.end) continue;
    out.push({
      start: normTime(l.start),
      end: normTime(l.end),
      title: l.subject + (l.room ? ' · ' + l.room : ''),
      type: 'busy'
    });
  }
  return out;
}
function normTime(t) {
  const m = String(t).match(/(\d{1,2})[:.](\d{2})/);
  return m ? String(m[1]).padStart(2, '0') + ':' + m[2] : t;
}

if (typeof module !== 'undefined') {
  module.exports = { fetchTimetable, parseRegulartt, parseEmbedded, timetableToBusy, normTime };
}
