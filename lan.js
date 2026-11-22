/* ================= sp — телефонный мост (LAN) =================
   Маленький http-сервер внутри sp: телефон в той же Wi-Fi открывает
   http://ip:порт/?k=ключ и видит план/задачи/заметки/anki.
   Защита: обязательный ключ доступа, генерируется один раз и живёт на ноуте. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

let server = null;
let currentKey = null;
let currentPort = null;
let onExternalChange = null; /* колбек в main: телефон что-то поменял */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

function makeKey() {
  return Math.random().toString(36).slice(2, 8);
}

function url(key, port) {
  const p = currentPort || port;
  return lanIps().map(ip => 'http://' + ip + ':' + p + '/?k=' + key);
}

function readStoreFile(dataFile) {
  try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
  catch (e) { return {}; }
}

function ankiCall(action, params) {
  return new Promise(resolve => {
    const body = JSON.stringify({ action, version: 6, params: params || {} });
    const req = http.request({
      host: '127.0.0.1', port: 8765, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      timeout: 4000
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(buf);
          resolve(j.error ? null : j.result);
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

function start(opts) {
  stop();
  const { dataFile, port, key, externalChange } = opts;
  const mobileRoot = path.resolve(opts.mobileDir);
  currentKey = key;
  onExternalChange = externalChange || null;

  server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.searchParams.get('k') !== currentKey) {
      res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('нет ключа доступа ♡');
      return;
    }
    const p = u.pathname;

    if (p === '/api/state') {
      const d = readStoreFile(dataFile);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        name: (d.profile && d.profile.name) || 'girl',
        wake: d.settings && d.settings.wake,
        sleep: d.settings && d.settings.sleep,
        plan: d.plan || null,
        planDate: d.planDate || null,
        planDone: d.planDone || {},
        tasks: (d.tasks || []).filter(t => !t.done),
        notes: (d.notes || []).slice(0, 12),
        anki: d.ankiCache || null
      }));
      return;
    }

    if (req.method === 'POST' && p === '/api/task-toggle') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { taskId, date } = JSON.parse(body);
          const d = readStoreFile(dataFile);
          const key2 = taskId + '@' + (date || '');
          d.planDone = d.planDone || {};
          if (d.planDone[key2]) delete d.planDone[key2]; else d.planDone[key2] = true;
          /* также в самих задачах */
          const t = (d.tasks || []).find(x => x.id === taskId);
          if (t) t.done = !!d.planDone[key2];
          fs.writeFileSync(dataFile, JSON.stringify(d, null, 1), 'utf8');
          if (onExternalChange) onExternalChange();
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"ok":true}');
        } catch (e) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end('{"ok":false}');
        }
      });
      return;
    }

    if (req.method === 'POST' && p === '/api/task-add') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        try {
          const { title, subject, deadline } = JSON.parse(body);
          if (!title || !String(title).trim()) throw new Error('empty');
          const d = readStoreFile(dataFile);
          d.tasks = d.tasks || [];
          d.tasks.unshift({
            id: 't' + Date.now(), title: String(title).slice(0, 140),
            subject: subject || null, deadline: deadline || null,
            effortMin: 30, priority: 1, energy: 'low', done: false,
            created: (date => (date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')))(new Date())
          });
          fs.writeFileSync(dataFile, JSON.stringify(d, null, 1), 'utf8');
          if (onExternalChange) onExternalChange();
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"ok":true}');
        } catch (e) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end('{"ok":false}');
        }
      });
      return;
    }

    if (p === '/api/anki-due') {
      const decks = await ankiCall('deckNames');
      let result = null;
      if (decks) {
        const stats = await ankiCall('getDeckStats', { decks });
        if (stats) {
          result = Object.values(stats)
            .filter(x => (x.new_count + x.learn_count + x.review_count) > 0)
            .map(x => ({ name: x.name, due: x.new_count + x.learn_count + x.review_count }));
        }
      }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ online: !!result, decks: result || [] }));
      return;
    }

    /* статика из mobile/ */
    let file = p === '/' ? '/index.html' : p;
    file = file.split('?')[0];
    const rel = path.normalize(file).replace(/^[.\\/]+/, '');
    const abs = path.resolve(path.join(mobileRoot, rel));
    if (!abs.startsWith(mobileRoot + path.sep) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('не нашла ♡');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream' });
    res.end(fs.readFileSync(abs));
  });

  /* порт занят? пробуем следующий, приложение не должно падать из-за Wi-Fi */
  let tryPort = port;
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && tryPort < port + 20) {
      tryPort += 1;
      console.warn('lan: порт ' + (tryPort - 1) + ' занят, пробую ' + tryPort);
      server.listen(tryPort, '0.0.0.0');
    } else if (err) {
      console.warn('lan-мост выключился тихо:', err.message); /* sp живёт без телефона */
    }
  });
  server.listen(tryPort, '0.0.0.0');
  currentPort = tryPort;
  return { port: tryPort, key: currentKey, urls: url(currentKey, tryPort) };
}

function stop() {
  if (server) { try { server.close(); } catch (e) {} }
  server = null;
}

module.exports = { start, stop, url, lanIps, makeKey };
