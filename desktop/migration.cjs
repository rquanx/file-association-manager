
const path = require('node:path');

const extensionPattern = /^\.[a-z0-9][a-z0-9_+-]{0,31}$/i;
const backupFormat = 'file-association-manager';
const lower = (value) => value.toLowerCase();

function text(value, limit = 512) {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u001f]/.test(value)) throw new Error('备份文件包含无效字段。');
  return value;
}

function extension(value) {
  if (typeof value !== 'string' || !extensionPattern.test(value)) throw new Error('备份文件包含无效扩展名。');
  return lower(value);
}

function collectionsFrom(value) {
  if (!Array.isArray(value)) throw new Error('备份文件缺少合集。');
  return value.map((item) => {
    const id = text(item?.id, 100);
    const name = text(item?.name, 40).trim();
    if (!/^custom-[\w-]+$/.test(id) || !name || !Array.isArray(item.extensions)) throw new Error('备份文件包含无效合集。');
    const extensions = [...new Set(item.extensions.map(extension))].sort();
    return { id, name, extensions };
  });
}

function makeBackup(catalog, collections) {
  const apps = new Map(catalog.apps.map((app) => [app.id, app]));
  return {
    format: backupFormat,
    version: 1,
    collections: collectionsFrom(collections),
    associations: catalog.types.flatMap((row) => {
      const app = apps.get(row.currentAppId);
      if (!app || !row.currentProgId) return [];
      return [{
        extension: row.extension,
        progId: row.currentProgId,
        name: app.name,
        appUserModelId: app.appUserModelId || '',
        executable: app.executable ? path.win32.basename(app.executable) : '',
      }];
    }),
  };
}

function parseBackup(value) {
  if (value?.format !== backupFormat || value.version !== 1 || !Array.isArray(value.associations) || value.associations.length > 4096) {
    throw new Error('无法识别此备份文件的格式或版本。');
  }
  const rows = new Map();
  for (const item of value.associations) {
    const ext = extension(item?.extension);
    if (rows.has(ext)) throw new Error('备份中同一扩展名出现多次。');
    rows.set(ext, {
      extension: ext, progId: text(item.progId), name: text(item.name),
      appUserModelId: text(item.appUserModelId), executable: text(item.executable, 260),
    });
  }
  return { collections: collectionsFrom(value.collections), associations: [...rows.values()] };
}

function planRestore(backup, catalog) {
  const current = new Map(catalog.types.map((row) => [row.extension, row]));
  const appNames = new Map(catalog.apps.map((app) => [app.id, app.name]));
  return backup.associations.map((row) => {
    const local = current.get(row.extension);
    const details = {
      extension: row.extension,
      backupName: row.name,
      currentAppId: local?.currentAppId,
      currentName: appNames.get(local?.currentAppId) || local?.currentProgId || null,
      currentProgId: local?.currentProgId || null,
    };
    const options = catalog.apps.filter((app) => Object.hasOwn(app.handlers, row.extension));
    const distinct = (items) => items.length === 1 ? items[0] : null;
    const byIdentity = row.appUserModelId && distinct(options.filter((app) => lower(app.appUserModelId || '') === lower(row.appUserModelId)));
    const byProgId = row.progId && distinct(options.filter((app) => lower(app.handlers[row.extension]) === lower(row.progId)));
    const byExecutable = row.executable && distinct(options.filter((app) => (
      lower(path.win32.basename(app.executable || '')) === lower(row.executable) && lower(app.name) === lower(row.name)
    )));
    const app = byIdentity || byProgId || byExecutable;
    if (!app) return {
      ...details,
      name: row.name,
      status: 'missing',
      source: lower(row.appUserModelId || (row.executable ? row.executable + '|' + row.name : row.name || row.progId)),
    };
    return {
      ...details, name: app.name, appId: app.id,
      status: local?.currentAppId === app.id ? 'unchanged' : 'ready',
    };
  });
}

function mapRestore(rows, source, app, executable) {
  const affected = rows.filter((row) => row.source === source && row.status === 'missing');
  const name = app?.name || path.win32.basename(executable, path.win32.extname(executable));
  const id = app?.id || 'portable:' + lower(executable);
  const matching = new Set(affected.filter((row) => executable || Object.hasOwn(app.handlers, row.extension))
    .map((row) => row.extension));
  if (!matching.size) throw new Error('这个应用未注册该组中的任何扩展名。');
  const updated = rows.map((row) => {
    if (!affected.includes(row)) return row;
    if (!matching.has(row.extension)) return { ...row, unsupportedBy: name };
    return { ...row, appId: id, name, unsupportedBy: null,
      status: row.currentAppId === id ? 'unchanged' : 'ready' };
  });
  return { rows: updated, mapped: matching.size, unsupported: affected.length - matching.size, name };
}

function restoreGroups(rows, mode, selection, executableFor) {
  const selected = selection == null ? null : new Set(selection.map(extension));
  const groups = new Map();
  for (const row of rows) {
    if (row.status !== (mode === 'retry' ? 'failed' : 'ready')) continue;
    if (mode === 'all' && selected && !selected.has(row.extension)) continue;
    if (!groups.has(row.appId)) groups.set(row.appId, {
      appId: row.appId, executable: executableFor(row.appId), extensions: [], expected: {},
    });
    const group = groups.get(row.appId);
    group.extensions.push(row.extension);
    group.expected[row.extension] = row.currentProgId;
  }
  return [...groups.values()];
}

module.exports = { extensionPattern, makeBackup, parseBackup, planRestore, mapRestore, restoreGroups };
