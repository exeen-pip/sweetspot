/* ================= sp — помойка-вход =================
   Кидай как попало — превращаем в структуру: предмет, дата, время, тег. */

const SUBJECT_HINTS = [
  ['матем', 'Математика'], ['алгебр', 'Математика'], ['геом"', 'Математика'],
  ['хим', 'Химия'], ['физ-', 'Физика'], [' физик', 'Физика'],
  ['qaz', 'Қазақ тілі'], ['қаза', 'Қазақ тілі'], ['каз', 'Қазақ тілі'],
  ['рус', 'Рус. яз.'], ['лит', 'Рус. яз.'],
  ['англ', 'English'], ['english', 'English'],
  ['ист', 'История'], ['всем', 'История'],
  ['биол', 'Биология'], ['био', 'Биология'],
  ['геогр', 'География'], ['гео', 'География'],
  ['информ', 'Информатика'], ['ит', 'Информатика'],
  ['искус', 'Искусство'], ['домбр', 'Домбра'], ['физра', 'Физ-ра']
];

const WEEKDAYS = { 'понедельник': 1, 'вторник': 2, 'среду': 3, 'среда': 3, 'четверг': 4, 'пятниц': 5, 'суббот': 6, 'воскресен': 0 };
const MONTHS = { 'январ': 0, 'феврал': 1, 'март': 2, 'апрел': 3, 'ма[йя]': 4, 'июн': 5, 'июл': 6, 'август': 7, 'сентябр': 8, 'октябр': 9, 'ноябр': 10, 'декабр': 11 };

const RU_DAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function detectSubject(text) {
  const low = ' ' + (text || '').toLowerCase() + ' ';
  for (const [hint, subj] of SUBJECT_HINTS) {
    if (low.includes(hint.toLowerCase())) return subj;
  }
  return null;
}

/* следующая дата с указанным днём недели */
function nextWeekday(from, dow) {
  const d = new Date(from);
  const diff = (dow - d.getDay() + 7) % 7 || 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
}
function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * parseDump — главная функция.
 * @returns entries [{id, raw, title, subject, deadline:'YYYY-MM-DD', time:'HH:MM', tag, source}]
 */
function parseDump(raw, opts) {
  const opts2 = opts || {};
  const now = opts2.now || new Date();
  const text = String(raw || '').trim();
  if (!text) return [];
  const out = [];
  const chunks = text.split(/\n+|;/);
  for (const chunk of chunks) {
    const entry = parseOne(chunk, now, opts2);
    if (entry) out.push(entry);
  }
  return out;
}

function parseOne(chunk, now, opts) {
  const t = chunk.trim();
  if (!t) return null;
  const low = t.toLowerCase();

  const entry = {
    id: 'e' + Date.now() + Math.floor(Math.random() * 999),
    raw: t,
    title: t.length > 90 ? t.slice(0, 88) + '…' : t,
    subject: detectSubject(t),
    deadline: null,
    time: null,
    tag: null,
    source: opts.source || 'typo'
  };

  /* даты */
  const B = '(?<![а-яёa-z0-9])', E = '(?![а-яёa-z0-9])';
  if (new RegExp(B + '(сегодня)' + E).test(low)) entry.deadline = fmtDate(now);
  else if (new RegExp(B + '(завтра)' + E).test(low)) entry.deadline = fmtDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  else if (new RegExp(B + '(послезавтра)' + E).test(low)) entry.deadline = fmtDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));
  else {
    for (const [w, dow] of Object.entries(WEEKDAYS)) {
      if (low.includes(w)) { entry.deadline = fmtDate(nextWeekday(now, dow)); break; }
    }
    if (!entry.deadline) {
      const md = low.match(/(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?/);
      if (md) {
        const y = md[3] ? (md[3].length === 2 ? 2000 + +md[3] : +md[3]) : now.getFullYear();
        const d = new Date(y, +md[2] - 1, +md[1]);
        if (!isNaN(d) && +md[2] >= 1 && +md[2] <= 12) entry.deadline = fmtDate(d);
      }
    }
    if (!entry.deadline) {
      for (const [mo, mi] of Object.entries(MONTHS)) {
        if (new RegExp('\\d{1,2}\\s+' + mo).test(low)) {
          const mm = low.match(new RegExp('(\\d{1,2})\\s+' + mo));
          if (mm) { entry.deadline = fmtDate(new Date(now.getFullYear(), mi, +mm[1])); break; }
        }
      }
    }
  }

  /* время */
  const tm = low.match(/(?:в|к|@)\s*(\d{1,2})[:.](\d{2})\b/) || low.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (tm) {
    const h = +tm[1], m = +tm[2];
    if (h >= 0 && h < 24 && m >= 0 && m < 60) entry.time = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  /* теги */
  if (/(кр|контрольн|соч|сор|экзам)/.test(low)) entry.tag = 'КР/СОЧ';
  else if (/(дз|домашк|домашн|домашка)/.test(low)) entry.tag = 'ДЗ';
  else if (/(созвон|встреч|звонок|онлайн)/.test(low)) entry.tag = 'событие';
  else if (/(куп|заказ|посылк|(parcel|package))/.test(low)) entry.tag = 'личное';

  /* усилие по длине текста */
  const words = t.split(/\s+/).length;
  entry.effortMin = Math.min(120, Math.max(20, words * 4));

  return entry;
}

/* ---- опционально: LLM-парсер (бесплатный ключ Gemini/Groq) ---- */
async function llmEnhance(entry, llm) {
  if (!llm || !llm.key) return entry;
  const prompt =
    'Ты — парсер заметок школьницы. Ответь ТОЛЬКО валидным JSON без пояснений: ' +
    '{"title": "коротко что сделать", "subject": "предмет|null", ' +
    '"deadline": "YYYY-MM-DD|null", "time": "HH:MM|null", "tag": "КР/СОЧ|ДЗ|событие|личное|null", ' +
    '"effortMin": число минут. Сегодня ' + new Date().toISOString().slice(0, 10) + '. Заметка: ' + entry.raw;
  try {
    let body;
    if (llm.provider === 'groq') {
      const r = await window.sp.http('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + llm.key },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0
        })
      });
      const j = JSON.parse(r.text || '{}');
      body = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    } else {
      const r = await window.sp.http(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + llm.key,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );
      const j = JSON.parse(r.text || '{}');
      body = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts &&
        j.candidates[0].content.parts[0].text;
    }
    const m = body && body.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      for (const k of ['title', 'subject', 'deadline', 'time', 'tag', 'effortMin']) {
        if (parsed[k] !== undefined && parsed[k] !== null && parsed[k] !== '') entry[k] = parsed[k];
      }
      entry.llm = true;
    }
  } catch (e) { /* тишина: эвристики уже отработали */ }
  return entry;
}

if (typeof module !== 'undefined') {
  module.exports = { parseDump, parseOne, detectSubject, fmtDate };
}
