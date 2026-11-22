const {
  app, BrowserWindow, ipcMain, dialog, Notification, shell, powerMonitor
} = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const lan = require('./lan');

let win = null;
let focusProc = null;
let focusState = null;

const dataDir = () => app.getPath('userData');
const dataFile = () => path.join(dataDir(), 'data.json');

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
  } catch (e) {
    return {};
  }
}

let saveTimer = null;
function writeStoreLater(data) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(dataDir(), { recursive: true });
      fs.writeFileSync(dataFile(), JSON.stringify(data, null, 1), 'utf8');
    } catch (e) { console.error('store save failed', e); }
  }, 250);
}

function createWindow() {
  const store = readStore();
  const w = store.window || {};
  win = new BrowserWindow({
    width: w.width || 1280,
    height: w.height || 800,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: '#f4d7e3',
    icon: path.join(__dirname, 'src', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });
  if (w.maximized) win.maximize();
  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  const saveWindowState = (maximized) => {
    const s = readStore();
    s.window = { width: win.getBounds().width, height: win.getBounds().height, maximized };
    writeStoreLater(s);
  };
  win.on('maximize', () => saveWindowState(true));
  win.on('unmaximize', () => saveWindowState(false));
  win.on('resized', () => {
    const s = readStore();
    s.window = { ...(s.window || {}), width: win.getBounds().width, height: win.getBounds().height };
    writeStoreLater(s);
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => { createWindow(); startLan(); });

/* ---------------- LAN-мост для телефона ---------------- */
async function startLan() {
  const s = readStore();
  s.lan = s.lan || {};
  if (s.lan.enabled === undefined) s.lan.enabled = true;
  if (!s.lan.key) s.lan.key = lan.makeKey();
  if (!s.lan.port) s.lan.port = 4200;
  writeStoreLater(s);
  if (!s.lan.enabled) return { enabled: false, port: s.lan.port, key: s.lan.key, urls: [] };
  const info = lan.start({
    dataFile: dataFile(),
    port: s.lan.port,
    mobileDir: path.join(__dirname, 'mobile'),
    key: s.lan.key,
    externalChange: () => { if (win) win.webContents.send('store:external'); }
  });
  if (!info || !info.urls.length) {
    console.warn('lan: Wi-Fi адрес не найден, сервер ждёт на порту', s.lan.port);
  }
  return info;
}

ipcMain.handle('lan:info', () => {
  const s = readStore();
  s.lan = s.lan || {};
  return {
    enabled: s.lan.enabled !== false,
    port: s.lan.port || 4200,
    key: s.lan.key || '',
    urls: s.lan.enabled === false ? [] : lan.url(s.lan.key || 'ключ появится после запуска', s.lan.port || 4200)
  };
});
ipcMain.handle('lan:restart', async () => { return startLan(); });
app.on('window-all-closed', () => app.quit());

/* ---------------- generic fetch through main (no CORS) ---------------- */
ipcMain.handle('http:fetch', async (e, { url, options }) => {
  try {
    const res = await netFetch(url, options || {});
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    return { ok: false, status: 0, error: String(err && err.message || err) };
  }
});

async function netFetch(url, options) {
  const { net } = require('electron');
  return net.fetch(url, options);
}

/* ---------------- store bridge ---------------- */
ipcMain.handle('store:get', () => readStore());
ipcMain.handle('store:put', (e, data) => {
  if (!data || typeof data !== 'object') return false;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(dataDir(), { recursive: true });
      fs.writeFileSync(dataFile(), JSON.stringify(data, null, 1), 'utf8');
    } catch (err) { console.error('store save failed', err); }
  }, 250);
  return true;
});
app.on('before-quit', () => { stopFocusWatcher(); });

/* ---------------- dialogs ---------------- */
ipcMain.handle('dialog:pick-audio', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Добавить музыку',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus'] }]
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('dialog:pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Папка библиотеки', properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:pick-image', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Фоновая картинка',
    properties: ['openFile'],
    filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  });
  return r.canceled ? null : r.filePaths[0];
});

/* ---------------- notifications ---------------- */
ipcMain.handle('app:notify', (e, { title, body, silent }) => {
  if (Notification.isSupported() && win && !win.isFocused()) {
    new Notification({ title, body, silent: !!silent }).show();
  }
  return true;
});
ipcMain.handle('app:open-external', (e, url) => { shell.openExternal(url); return true; });
ipcMain.handle('app:open-path', (e, p) => { shell.openPath(p); return true; });
/* ---------------- walls: Pinterest-vibe backgrounds (Unsplash, free) ---------------- */
async function wallsSearchUnsplash(q) {
  const url = 'https://unsplash.com/napi/search/photos?per_page=24&query=' + encodeURIComponent(q);
  const res = await netFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 sp-sweet-spot' } });
  if (!res.ok) throw new Error('unsplash ' + res.status);
  const json = JSON.parse(await res.text());
  return (json.results || []).map(r => ({
    id: 'u_' + r.id,
    thumb: r.urls ? (r.urls.small || r.urls.regular) : null,
    full: r.urls ? r.urls.regular : null,
    author: r.user && r.user.name,
    link: r.links && r.links.html
  })).filter(r => r.thumb && r.full);
}

async function wallsSearchOpenverse(q) {
  const url = 'https://api.openverse.org/v1/images/?page_size=24&q=' + encodeURIComponent(q);
  const res = await netFetch(url, { headers: { 'User-Agent': 'sp-sweet-spot/0.1' } });
  if (!res.ok) throw new Error('openverse ' + res.status);
  const json = JSON.parse(await res.text());
  return (json.results || []).map(r => ({
    id: 'ov_' + (r.id || Math.random().toString(36).slice(2)),
    thumb: r.thumbnail || r.url,
    full: r.url,
    author: r.creator,
    link: r.foreign_landing_url || null
  })).filter(r => r.thumb && r.full);
}

ipcMain.handle('walls:search', async (e, { q }) => {
  const qq = q || 'aesthetic';
  try {
    const a = await wallsSearchUnsplash(qq);
    if (a.length) return a;
  } catch (err1) {
    try {
      const b = await wallsSearchOpenverse(qq);
      if (b.length) return b;
      return { error: 'ничего не нашлось, попробуй другое слово ♡' };
    } catch (err2) {
      return { error: 'сеть не отвечает: ' + String(err1 && err1.message || err1).slice(0, 80) + ' / ' + String(err2 && err2.message || err2).slice(0, 80) };
    }
  }
  return { error: 'ничего не нашлось, попробуй другое слово ♡' };
});

ipcMain.handle('walls:save', async (e, { item }) => {
  try {
    const res = await netFetch(item.full || item.thumb);
    const buf = Buffer.from(await res.arrayBuffer());
    const dir = path.join(dataDir(), 'wallpapers');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, (item.id || 'wall') + '_' + Date.now() + '.jpg');
    fs.writeFileSync(file, buf);
    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

ipcMain.handle('app:set-bg', (e, file) => {
  const s = readStore();
  s.ui = s.ui || {};
  s.ui.bgFile = file;
  writeStoreLater(s);
  return true;
});

/* ---------------- focus watcher (Windows) ---------------- */
const PS_SCRIPT = `
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;using System.Text;
public class FG{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")]public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);}' ;
while($true){
  $h=[FG]::GetForegroundWindow();
  $sb=New-Object System.Text.StringBuilder 512;
  [void][FG]::GetWindowText($h,$sb,512);
  Write-Output $sb.ToString();
  Start-Sleep -Seconds 2
}`;

function startFocusWatcher(cfg) {
  stopFocusWatcher();
  focusState = {
    startedAt: Date.now(),
    sessionMin: cfg.sessionMin || 25,
    whitelist: (cfg.whitelist || []).map(s => String(s).toLowerCase()),
    violations: []
  };
  focusProc = spawn('powershell.exe', ['-NoProfile', '-Command', PS_SCRIPT], { windowsHide: true });
  let buf = '';
  focusProc.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || '';
    for (const title of lines) onFocusedWindow(title.trim());
  });
  focusProc.stderr.on('data', (chunk) => console.error('focus watcher:', String(chunk)));
  focusState.proc = true;
  return true;
}

function onFocusedWindow(title) {
  if (!focusState || !win) return;
  const t = (title || '').toLowerCase();
  if (!t) return;
  const own = t.includes('sp') || t.includes('sweet spot');
  const allowed = own || focusState.whitelist.some(w => t.includes(w));
  if (!allowed) {
    focusState.violations.push({ at: new Date().toISOString(), title: title.slice(0, 120) });
    win.webContents.send('focus:violation', { title: title.slice(0, 80), count: focusState.violations.length });
    if (Notification.isSupported() && !win.isFocused()) {
      new Notification({
        title: 'вернись в sweet spot ♡',
        body: 'ты обещала фокус. окно: ' + title.slice(0, 60)
      }).show();
    }
  }
}

function stopFocusWatcher() {
  if (focusProc) { try { focusProc.kill(); } catch (e) {} }
  focusProc = null;
}

ipcMain.handle('focus:start', (e, cfg) => startFocusWatcher(cfg || {}));
ipcMain.handle('focus:stop', () => {
  const result = focusState ? {
    violations: focusState.violations,
    startedAt: focusState.startedAt,
    minutes: Math.round((Date.now() - focusState.startedAt) / 60000)
  } : null;
  stopFocusWatcher();
  if (result) {
    const s = readStore();
    s.focusLog = s.focusLog || [];
    s.focusLog.push({ date: new Date().toISOString().slice(0, 10), minutes: result.minutes, violations: result.violations.length });
    writeStoreLater(s);
  }
  focusState = null;
  return result;
});
ipcMain.handle('focus:state', () => focusState ? { ...focusState, proc: undefined } : null);

/* ---------------- yt-dlp helpers ---------------- */
function ytdlpCheck() {
  return new Promise(res => {
    execFile('yt-dlp', ['--version'], { timeout: 8000 }, (err, stdout) => {
      res(err ? null : String(stdout).trim());
    });
  });
}
ipcMain.handle('ytdlp:check', async () => await ytdlpCheck());
ipcMain.handle('ytdlp:download', async (e, { url, outDir }) => {
  const version = await ytdlpCheck();
  if (!version) return { ok: false, error: 'yt-dlp не найден на этом ноуте' };
  return new Promise(res => {
    fs.mkdirSync(outDir, { recursive: true });
    execFile('yt-dlp', [
      '-x', '--audio-format', 'mp3', '--audio-quality', '0',
      '--embed-thumbnail', '--add-metadata',
      '-o', path.join(outDir, '%(title)s.%(ext)s'),
      '--no-playlist-warning', url
    ], { maxBuffer: 1024 * 1024 * 20, timeout: 1000 * 60 * 30, windowsHide: true }, (err, stdout, stderr) => {
      res(err
        ? { ok: false, error: String(stderr || err.message).slice(-600) }
        : { ok: true, out: String(stdout).slice(-600) });
    });
  });
});
