/* ================= sp — store ================= */
/* всё состояние в одном JSON, живёт в userData/data.json */

const DEFAULTS = {
  profile: { name: 'girl' },
  ui: {
    theme: 'theme-coquette',
    accent: null,
    bgFile: null,
    fonts: 'serif',
    widgets: {
      clock:     { on: true, size: 's',  order: 0 },
      planner:   { on: true, size: 'l',  order: 1 },
      inbox:     { on: true, size: 'm',  order: 2 },
      tasks:     { on: true, size: 'm',  order: 3 },
      notes:     { on: true, size: 'm',  order: 4 },
      player:    { on: true, size: 'm',  order: 5 },
      calculator:{ on: true, size: 's',  order: 6 },
      anki:      { on: true, size: 's',  order: 7 },
      focus:     { on: true, size: 's',  order: 8 }
    }
  },
  settings: {
    wake: '07:30',
    sleep: '23:00',
    warmupIntervalMin: 60,
    warmupLengthMin: 5,
    warmupOn: true,
    energy: [
      { from: '07:00', to: '12:00', level: 'high' },
      { from: '12:00', to: '16:00', level: 'mid'  },
      { from: '16:00', to: '19:00', level: 'low'  },
      { from: '19:00', to: '23:30', level: 'high' }
    ],
    subjects: ['Математика', 'Химия', 'Физика', 'Қазақ тілі', 'Рус. яз.', 'English', 'История', 'Биология', 'География', 'Информатика'],
    edupage: { schoolUrl: '', classId: '7A', lastTimetable: null },
    llm: { provider: 'gemini', key: '' },
    focus: { whitelist: ['word', 'excel', 'powerpoint', 'anki', 'ankiweb', 'notion', 'vscode', 'quizlet'] },
    musicFolder: null
  },
  tasks: [],
  inbox: [],
  notes: [],
  desires: [],
  plan: null,
  planDate: null,
  planDone: {},
  ankiCache: null,
  focusLog: []
};

const Store = {
  data: null,
  async load() {
    const raw = await window.sp.store.get();
    this.data = deepMerge(structuredClone(DEFAULTS), raw || {});
    return this.data;
  },
  save() {
    return window.sp.store.put(this.data);
  },
  saveSoon: null,
  patch(fn) {
    fn(this.data);
    clearTimeout(this.saveSoon);
    this.saveSoon = setTimeout(() => this.save(), 300);
  }
};

function deepMerge(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  for (const k of Object.keys(extra)) {
    const v = extra[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      base[k] = deepMerge(base[k] && typeof base[k] === 'object' ? base[k] : {}, v);
    } else {
      base[k] = v;
    }
  }
  return base;
}
