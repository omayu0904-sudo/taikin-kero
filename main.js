const { app, BrowserWindow, Menu, Tray, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const W = 240, H = 220;
const DEFAULTS = {
  start: '09:00',
  end: '18:00',
  days: [1, 2, 3, 4, 5], // 0=日 ... 6=土
  size: 1,
  alwaysOnTop: true,
  locked: false,
  sound: true,
  soundWork: true,
  autoLaunch: false,
  pos: null,
  configured: false,
};

let cfg = { ...DEFAULTS };
let win = null, settingsWin = null, tray = null;
const cfgPath = () => path.join(app.getPath('userData'), 'config.json');

function loadCfg() {
  try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgPath(), 'utf8')) }; } catch (e) { cfg = { ...DEFAULTS }; }
}
function saveCfg() {
  try { fs.writeFileSync(cfgPath(), JSON.stringify(cfg, null, 2)); } catch (e) {}
}
function applyCfg() {
  if (!win) return;
  win.setAlwaysOnTop(cfg.alwaysOnTop, 'screen-saver');
  win.setSize(Math.round(W * cfg.size), Math.round(H * cfg.size));
  app.setLoginItemSettings({ openAtLogin: !!cfg.autoLaunch });
  win.webContents.send('config', cfg);
  saveCfg();
  buildMenu();
}

function defaultPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  const w = Math.round(W * cfg.size), h = Math.round(H * cfg.size);
  if (process.platform === 'darwin') return { x: wa.x + wa.width - w - 20, y: wa.y };
  return { x: wa.x + wa.width - w - 20, y: wa.y + wa.height - h + 8 };
}

function createWindow() {
  const pos = cfg.pos || defaultPos();
  win = new BrowserWindow({
    width: Math.round(W * cfg.size), height: Math.round(H * cfg.size),
    x: pos.x, y: pos.y,
    transparent: true, frame: false, resizable: false, hasShadow: false,
    skipTaskbar: true, alwaysOnTop: cfg.alwaysOnTop, focusable: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  win.setAlwaysOnTop(cfg.alwaysOnTop, 'screen-saver');
  win.loadFile('index.html');
  win.webContents.on('did-finish-load', () => win.webContents.send('config', cfg));
  win.on('moved', () => { const [x, y] = win.getPosition(); cfg.pos = { x, y }; saveCfg(); });
}

function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 380, height: 560, title: '設定', resizable: false, autoHideMenuBar: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile('settings.html');
  settingsWin.webContents.on('did-finish-load', () => settingsWin.webContents.send('config', cfg));
  settingsWin.on('closed', () => { settingsWin = null; });
}

function toggle(key) { cfg[key] = !cfg[key]; applyCfg(); }

function buildMenu() {
  const m = Menu.buildFromTemplate([
    { label: '設定…', click: openSettings },
    { type: 'separator' },
    { label: 'カエルの大きさ', submenu: [
      ['極小', 0.4], ['小', 0.6], ['やや小', 0.8], ['標準', 1], ['大', 1.4],
    ].map(([label, v]) => ({ label, type: 'radio', checked: Math.abs(cfg.size - v) < 0.05,
      click: () => { cfg.size = v; applyCfg(); } })) },
    { label: '音を出す', type: 'checkbox', checked: cfg.sound, click: () => toggle('sound') },
    { label: '勤務中のケロケロ', type: 'checkbox', checked: cfg.soundWork, click: () => toggle('soundWork') },
    { label: '常に手前に表示', type: 'checkbox', checked: cfg.alwaysOnTop, click: () => toggle('alwaysOnTop') },
    { label: '位置を固定', type: 'checkbox', checked: cfg.locked, click: () => toggle('locked') },
    { label: process.platform === 'darwin' ? 'ログイン時に自動実行' : 'Windows起動時に自動実行', type: 'checkbox', checked: cfg.autoLaunch, click: () => toggle('autoLaunch') },
    { type: 'separator' },
    { label: 'プレビュー: 退勤！', click: () => win && win.webContents.send('preview', 'leave') },
    { label: 'プレビュー: 残業…', click: () => win && win.webContents.send('preview', 'over') },
    { type: 'separator' },
    { label: '終了', click: () => app.quit() },
  ]);
  if (tray) tray.setContextMenu(m);
  return m;
}

app.whenReady().then(() => {
  loadCfg();
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  createWindow();

  // トレイ(メニューバー)アイコン: 16x16の緑の丸を生成
  const size = 16, buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5), i = (y * size + x) * 4;
    const on = d < 7;
    buf[i] = 120; buf[i + 1] = 190; buf[i + 2] = 100; buf[i + 3] = on ? 255 : 0;
  }
  tray = new Tray(nativeImage.createFromBuffer(buf, { width: size, height: size }));
  tray.setToolTip('退勤ケロ');
  buildMenu();

  if (!cfg.configured) { openSettings(); }
});

ipcMain.on('contextmenu', () => { if (win) buildMenu().popup({ window: win }); });
ipcMain.on('drag-move', (_e, d) => {
  if (!win || cfg.locked) return;
  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + d.dx), Math.round(y + d.dy));
});
ipcMain.on('save-config', (_e, next) => {
  cfg = { ...cfg, ...next, configured: true };
  applyCfg();
  if (settingsWin) settingsWin.close();
});
ipcMain.on('open-settings', openSettings);

app.on('window-all-closed', (e) => { e.preventDefault(); });
