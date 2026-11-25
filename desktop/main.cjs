const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const { spawn } = require('node:child_process');
const { open, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { extensionPattern, makeBackup, parseBackup, planRestore, mapRestore, restoreGroups } = require('./migration.cjs');
const { journal } = require('./history.cjs');
const { translate, languagePreference } = require('./language.cjs');

const entry = path.join(__dirname, '..', 'dist', 'index.html');
const worker = path.join(app.isPackaged ? process.resourcesPath : __dirname, 'AssociationWorker.ps1');
const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
let mainWindow;
let writeInProgress = false;
const selectedExecutables = new Map();
const iconCache = new Map();
let installedApps = new Map();
let pendingRestore;
let pendingRollback;
const history = journal(app.getPath('userData'));
const language = languagePreference(app.getPath('userData'));
const t = (message, values) => translate(language.get(), message, values);
let recovery;
const readStates = (extensions) => runWorker({ action: 'states', extensions: [...new Set(extensions)] });

function recoverHistory() {
  if (!recovery) recovery = history.reconcile(readStates).finally(() => { recovery = undefined; });
  return recovery;
}

function recoveryNotice(report) {
  const extensions = [...new Set(report.failures.flatMap((item) => item.extensions))];
  return [
    extensions.length ? t('这些扩展名已变更，历史写入失败，重启后可再次恢复 {extensions}', { extensions: extensions.join(', ') }) : '',
    report.failures.length && !extensions.length ? t("未能完成历史恢复。") : '',
    report.uncertain.length ? t('无法确认这些扩展名的中断结果 {extensions}', { extensions: report.uncertain.join(', ') }) : '',
  ].filter(Boolean).join(' ');
}

async function writeAssociations(request, operation) {
  if (writeInProgress) throw new Error(t("已有文件关联操作正在进行。"));
  writeInProgress = true;
  try {
    if (recovery) await recovery.catch(() => {});
    const journalPath = await history.prepare(operation);
    let result;
    let failure;
    try { result = await runWorker({ ...request, journalPath }); }
    catch (error) { failure = error; }
    let report;
    try { report = await history.reconcile(readStates, journalPath); }
    catch {
      const rows = result?.results || (result ? [result] : []);
      const changes = rows.filter((row) => row.time).map((row) => row.extension);
      report = { failures: [{ extensions: changes }], recovered: [], uncertain: [] };
    }
    const warning = recoveryNotice(report);
    if (failure) {
      const affected = [...new Set([...report.recovered.map((row) => row.extension), ...report.failures.flatMap((item) => item.extensions)])];
      throw new Error([t(failure.message), affected.length ? t('操作中断，已检测到变更 {extensions}', { extensions: affected.join(', ') }) : '', warning].filter(Boolean).join(' '));
    }
    if (warning) result.historyWarning = warning;
    return result;
  } finally {
    writeInProgress = false;
  }
}

function runWorker(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-File', worker], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    let errors = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { errors += chunk; });
    child.stdin.on('error', () => {});
    child.once('error', reject);
    child.once('close', (code) => {
      try {
        const result = JSON.parse(output);
        if (code !== 0 || result.error) throw new Error(result.error || errors || 'Windows worker failed.');
        resolve(result);
      } catch (error) {
        reject(new Error(output.trim() && code === 0 ? error.message : (errors.trim() || error.message)));
      }
    });
    child.stdin.end(JSON.stringify(request), 'utf8');
  });
}

function authorized(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame?.parent) {
    throw new Error('Unexpected request source.');
  }
}

ipcMain.handle('associations:catalog', async (event) => {
  authorized(event);
  const catalog = await runWorker({ action: 'catalog' });
  installedApps = new Map(catalog.apps.map((item) => [item.id, item]));
  return catalog;
});

ipcMain.handle('associations:icons', async (event, ids) => {
  authorized(event);
  if (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => typeof id !== 'string')) throw new Error('Invalid icon request.');
  const items = [];
  const values = new Map();
  for (const id of new Set(ids)) {
    if (iconCache.has(id)) {
      values.set(id, iconCache.get(id));
      continue;
    }
    const installed = installedApps.get(id);
    const exe = selectedExecutables.get(id) || installed?.executable;
    if (exe) items.push({ id, executable: exe });
    else if (installed?.appUserModelId?.includes('!')) items.push({ id, appUserModelId: installed.appUserModelId });
    else values.set(id, null);
  }
  if (items.length) {
    const icons = await runWorker({ action: 'icons', items }).catch(() => ({}));
    await Promise.all(items.map(async ({ id, executable }) => {
      const icon = Object.hasOwn(icons, id) ? icons[id] : null;
      if (icon || !executable) {
        values.set(id, icon);
        return;
      }
      try {
        const image = await app.getFileIcon(executable, { size: 'normal' });
        values.set(id, image.isEmpty() ? null : image.toDataURL());
      } catch {
        values.set(id, null);
      }
    }));
  }
  for (const [id, value] of values) iconCache.set(id, value);
  return Object.fromEntries(values);
});

ipcMain.handle('associations:theme', (event, theme) => {
  authorized(event);
  const { color, symbolColor } = theme || {};
  if (![color, symbolColor].every((value) => typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value))) {
    throw new Error('Invalid window colors.');
  }
  mainWindow.setTitleBarOverlay({ color, symbolColor, height: 32 });
});

ipcMain.handle('associations:browse', async (event) => {
  authorized(event);
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: t("选择应用程序"),
    properties: ['openFile'],
    filters: [{ name: t("Windows 应用程序"), extensions: ['exe'] }],
  });
  const executable = filePaths[0];
  if (!executable || path.extname(executable).toLowerCase() !== '.exe') return null;
  const id = 'portable:' + executable.toLowerCase();
  selectedExecutables.set(id, executable);
  return { id, name: path.basename(executable, path.extname(executable)), detail: executable, handlers: {}, portable: true };
});

ipcMain.handle('associations:apply', async (event, request) => {
  authorized(event);
  if (writeInProgress) throw new Error('An association update is already running.');
  if (typeof request?.appId !== 'string' || request.appId.length > 1024 ||
      !Array.isArray(request.extensions) || !request.extensions.length || request.extensions.length > 2048 ||
      request.extensions.some((ext) => typeof ext !== 'string' || !extensionPattern.test(ext))) {
    throw new Error('Invalid association selection.');
  }
  return writeAssociations({
      action: 'apply',
      appId: request.appId,
      executable: selectedExecutables.get(request.appId),
      extensions: request.extensions,
  }, 'apply');
});

ipcMain.handle('associations:history', (event) => {
  authorized(event);
  return (async () => {
    const report = writeInProgress ? null : await recoverHistory();
    return { entries: await history.read(), warning: report ? recoveryNotice(report) : '' };
  })();
});

ipcMain.handle('associations:preview-rollback', async (event, id) => {
  authorized(event);
  pendingRollback = undefined;
  const entry = (await history.read()).find((row) => row.id === id);
  if (!entry) throw new Error(t("找不到这条历史记录。"));
  const current = await runWorker({ action: 'state', extension: entry.extension });
  pendingRollback = { entry, current };
  return { id, extension: entry.extension, current, target: entry.before };
});

ipcMain.handle('associations:rollback', async (event, id) => {
  authorized(event);
  if (pendingRollback?.entry.id !== id) throw new Error(t("请重新打开回退确认。"));
  const { entry, current } = pendingRollback;
  const result = await writeAssociations({
    action: 'rollback', extension: entry.extension, progId: entry.before.progId, expected: current.progId,
  }, 'rollback');
  if (result.status === 'stale') pendingRollback = { entry, current: result.current };
  else pendingRollback = undefined;
  return result;
});

ipcMain.handle('associations:version', (event) => {
  authorized(event);
  return app.getVersion();
});

ipcMain.handle('preferences:language', (event) => {
  authorized(event);
  return language.get();
});

ipcMain.handle('preferences:set-language', (event, value) => {
  authorized(event);
  language.set(value);
  mainWindow.setTitle(t('文件关联管理器'));
  return value;
});

ipcMain.handle('associations:export', async (event, collections) => {
  authorized(event);
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: t("导出文件关联备份"),
    defaultPath: 'file-association-backup.json',
    filters: [{ name: t("文件关联备份"), extensions: ['json'] }],
  });
  if (!filePath) return null;
  const catalog = await runWorker({ action: 'catalog' });
  const backup = makeBackup(catalog, collections);
  await writeFile(filePath, JSON.stringify(backup, null, 2) + '\n', 'utf8');
  return { collections: backup.collections.length, associations: backup.associations.length };
});

ipcMain.handle('associations:preview-import', async (event) => {
  authorized(event);
  pendingRestore = undefined;
  const { filePaths: [file] } = await dialog.showOpenDialog(mainWindow, {
    title: t("导入文件关联备份"),
    filters: [{ name: t("文件关联备份"), extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (!file) return null;
  const handle = await open(file, 'r');
  let backup;
  try {
    const { size } = await handle.stat();
    if (size > 4 * 1024 * 1024) throw new Error(t("备份文件超过 4 MB。"));
    backup = parseBackup(JSON.parse((await handle.readFile('utf8')).replace(/^\uFEFF/, '')));
  } finally {
    await handle.close();
  }
  const catalog = await runWorker({ action: 'catalog' });
  installedApps = new Map(catalog.apps.map((item) => [item.id, item]));
  const rows = planRestore(backup, catalog);
  pendingRestore = rows;
  return { collections: backup.collections, rows };
});

ipcMain.handle('associations:map-restore', (event, source, appId) => {
  authorized(event);
  if (!pendingRestore || writeInProgress) throw new Error(t("无法应用此导入，请重新打开备份。"));
  if (typeof source !== 'string') throw new Error(t("请先选择一个未匹配的原应用。"));
  const app = installedApps.get(appId);
  const executable = selectedExecutables.get(appId);
  if (!app && !executable) throw new Error(t("请先选择本机应用。"));
  const mapping = mapRestore(pendingRestore, source, app, executable);
  pendingRestore = mapping.rows;
  return mapping;
});

ipcMain.handle('associations:restore', async (event, mode = 'all', selection) => {
  authorized(event);
  if (!pendingRestore || writeInProgress) throw new Error(t("无法应用此导入，请重新打开备份。"));
  if (mode === 'collections') {
    pendingRestore = undefined;
    return { results: [], collectionsOnly: true };
  }
  if (!['all', 'retry'].includes(mode)) throw new Error('Invalid restore mode.');
  if (mode === 'all' && (!Array.isArray(selection) || selection.length > 4096)) throw new Error(t("请重新选择要恢复的扩展名。"));
  const groups = restoreGroups(pendingRestore, mode, selection, (id) => selectedExecutables.get(id));
  if (!groups.length) return { results: [] };
  const result = await writeAssociations({ action: 'restore', groups }, 'restore');
  const statuses = new Map(result.results.map((row) => [row.extension, row.status]));
  pendingRestore = pendingRestore.map((row) => ({ ...row, status: statuses.get(row.extension) || row.status }));
  return result;
});

ipcMain.handle('associations:settings', (event) => {
  authorized(event);
  return shell.openExternal('ms-settings:defaultapps');
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1260, height: 850, minWidth: 900, minHeight: 650,
    title: t("文件关联管理器"),
    backgroundColor: '#0d1118',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#10151e', symbolColor: '#c3ccd9', height: 32 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => { if (writeInProgress) event.preventDefault(); });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(entry);
}

if (app.requestSingleInstanceLock({ version: app.getVersion() })) {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    void recoverHistory().catch(() => {});
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
} else {
  app.whenReady().then(() => dialog.showMessageBox({
    type: 'info', title: t("文件关联管理器"), message: t("已有一个文件关联管理器窗口正在运行。"),
    detail: t('此次启动的是 v{version}。如果你正在升级，请先退出当前窗口，再打开新版。', { version: app.getVersion() }),
  })).finally(() => app.quit());
}
