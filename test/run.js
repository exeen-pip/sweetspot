const path = require('path');
global.window = { http: async () => ({ ok: false, text: '' }) };  /* заглушки сети для браузерных модулей */

const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }
function assertEq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ' got=' + JSON.stringify(a) + ' want=' + JSON.stringify(b)); }

const { hmToMin, minToHm, durText, planDay, planStats } = require('../src/js/planner.js');
const { parseDump, detectSubject } = require('../src/js/inbox.js');
const { timetableToBusy, normTime } = require('../src/js/edupage.js');

test('hmToMin / minToHm / durText', () => {
  assertEq(hmToMin('07:30'), 450);
  assertEq(minToHm(450), '07:30');
  assertEq(durText(45), '45м');
  assertEq(durText(90), '1ч30м');
});

test('план: задача попадает в свободную щель вне школы', () => {
  const blocks = planDay({
    wake: '07:00', sleep: '22:00',
    busy: [{ start: '08:40', end: '15:00', title: 'школа', type: 'busy' }],
    tasks: [{ id: 't1', title: 'химия соч', deadline: '2026-11-22', effortMin: 60, priority: 3, energy: 'high' }],
    desires: [], warmupOn: false, energy: []
  });
  const tasks = blocks.filter(b => b.type === 'task');
  assert(tasks.length >= 1, 'задача не запланирована');
  for (const t of tasks) {
    assert(t.end - t.start <= 90, 'блок длиннее 90');
    const overlap = blocks.some(b => b.type === 'busy' && t.start < b.end && t.end > b.start);
    assert(!overlap, 'задача налезла на школу');
  }
  const st = planStats(blocks);
  assert(st.task >= 60, 'минимум 60 минут учёбы, got ' + st.task);
});

test('план: разминки появляются и не налезают на busy', () => {
  const blocks = planDay({
    wake: '07:00', sleep: '22:00',
    busy: [{ start: '10:00', end: '10:30', title: 'дело', type: 'busy' }],
    tasks: [], desires: [], warmupOn: true, warmupIntervalMin: 60, warmupLengthMin: 5, energy: []
  });
  const warm = blocks.filter(b => b.type === 'warm');
  assert(warm.length > 5, 'мало разминок: ' + warm.length);
  for (const w of warm) {
    const overlap = blocks.some(b => b.type === 'busy' && w.start < b.end && w.end > b.start);
    assert(!overlap, 'разминка налезла на busy');
  }
});

test('план: желания получают слот, а не игнорируются', () => {
  const blocks = planDay({
    wake: '07:00', sleep: '22:00', busy: [], tasks: [],
    desires: [{ id: 'd1', title: 'пинтерест', durationMin: 40 }],
    warmupOn: false, energy: []
  });
  assert(blocks.some(b => b.type === 'desire' && b.title.includes('пинтерест')), 'желание не запланировано');
});

test('план: не влезло — честный overflow', () => {
  const blocks = planDay({
    wake: '19:00', sleep: '20:00', busy: [], tasks: [
      { id: 't1', title: 'огромный проект', deadline: '2026-11-22', effortMin: 600, priority: 1, energy: 'mid' }
    ],
    desires: [], warmupOn: false, energy: []
  });
  assert(blocks.some(b => b.type === 'overflow'), 'нет хвоста-переполнения');
});

test('помойка: предмет + тег КР + время', () => {
  const [e] = parseDump('кр по химии завтра в 19:00', { now: new Date(2026, 10, 20) });
  assertEq(e.subject, 'Химия');
  assertEq(e.tag, 'КР/СОЧ');
  assertEq(e.deadline, '2026-11-21');
  assertEq(e.time, '19:00');
});

test('помойка: пятница -> ближайшая будущая пятница', () => {
  const [e] = parseDump('сочинение в пятницу', { now: new Date(2026, 10, 16, 12, 0) }); /* пн */
  assertEq(e.deadline, '2026-11-20');
});

test('помойка: две строки = две записи', () => {
  const es = parseDump('реферат по истории к 25.11\nкупить подарок маме');
  assertEq(es.length, 2);
  assertEq(es[0].deadline, '2026-11-25');
  assertEq(es[1].tag, 'личное');
});

test('edupage: нормализация времени и busy', () => {
  assertEq(normTime('8:40'), '08:40');
  assertEq(normTime('08:55'), '08:55');
  const tt = { days: [{ dayName: 'пн', lessons: [{ start: '8:40', end: '9:25', subject: 'Математика', room: '204' }] }] };
  const busy = timetableToBusy(tt, 0);
  assertEq(busy, [{ start: '08:40', end: '09:25', title: 'Математика · 204', type: 'busy' }]);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + ' :: ' + e.message); }
}
console.log(failed ? '\n' + failed + ' упали' : '\nвсе ' + tests.length + ' тестов зелёные ♡');
process.exit(failed ? 1 : 0);
