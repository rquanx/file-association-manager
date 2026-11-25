import { LanguageProvider, useLanguage } from './Language.jsx';
import { Button, Checkbox, Dialog, IconButton, SearchField, Select, TextInput } from './Controls.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Check, CheckCircle2, ChevronDown,
  CircleAlert, CopyPlus, Download, FileQuestion, Files, FolderOpen, History, Link2,
  LoaderCircle, Monitor, Pencil, Plus, RefreshCw, Settings, Trash2, Upload,
} from 'lucide-react';
import { builtIns as collectionDefinitions, customIcon, readCollections, saveCollections } from './collections.js';
import { AppIcon } from './AppIcon.jsx';
import './styles.css';
import { AppearanceSettings, appearanceKeys, readAppearance } from './AppearanceSettings.jsx';
import { Pagination, usePage, useTablePageSize } from './Pagination.jsx';
import './controls.css';
import { HistoryDialog } from './HistoryDialog.jsx';

const api = window.associationManager;
const friendlyError = (error) => String(error?.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '');
const statusLabel = { changed: '已应用', unchanged: '已是默认', failed: '未生效' };
const appKind = { desktop: '桌面应用', packaged: 'Windows 应用', handler: 'Windows 处理程序' };
const supports = (app, ext) => Boolean(app?.portable || (app && Object.hasOwn(app.handlers, ext)));
const failuresFirst = (rows) => [...rows].sort((a, b) => Number(b.status === 'failed') - Number(a.status === 'failed'));
const failureMessage = (row) => ({
  windows: 'Windows 拒绝修改此扩展名。',
  stale: '默认应用已发生变化。请重新导入并核对预览。',
}[row.reason] || row.message);

function mergeResults(previous, retry) {
  const rows = new Map(previous.results.map((row) => [row.extension, row]));
  for (const row of retry.results) rows.set(row.extension, row);
  return { ...retry, results: [...rows.values()], historyWarning: retry.historyWarning || previous.historyWarning };
}

function CollectionEditor({ draft, types, collections, onClose, onSave, onDelete }) {
  const { t } = useLanguage();
  const [name, setName] = useState(draft.name);
  const [chosen, setChosen] = useState(new Set(draft.extensions));
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [sourceId, setSourceId] = useState(draft.source || '');
  const [extensionPage, setExtensionPage] = useState(0);
  const [copiedExtensions, setCopiedExtensions] = useState(draft.extensions);
  const all = [...new Set([...types.map((type) => type.extension), ...draft.extensions, ...added, ...chosen])].sort();
  const priority = new Set(copiedExtensions);
  const matches = all.filter((ext) => ext.includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(priority.has(b)) - Number(priority.has(a)));
  const extensions = usePage(matches, extensionPage, 32);
  const proposed = '.' + query.trim().toLowerCase().replace(/^\./, '');
  const canAdd = /^\.[a-z0-9][a-z0-9_+-]{0,31}$/.test(proposed) && !all.includes(proposed);
  const source = collections.find((item) => item.id === sourceId);
  return <Dialog title={draft.id ? t("编辑合集") : t("新建合集")} onClose={onClose}>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!name.trim() || !chosen.size) return;
      try { onSave(name.trim(), [...chosen].sort()); } catch (failure) { setError(t(friendlyError(failure))); }
    }}>
      <label className="field-label" htmlFor="collection-name">{t("合集名称")}</label>
      <TextInput id="collection-name" autoFocus maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("例如 摄影工作流")} required />
      {!draft.id && <div className="collection-template">
        <label className="field-label" htmlFor="collection-source">{t("从现有合集复制")}</label>
        <div className="collection-template-controls">
          <Select id="collection-source" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
            <option value="">{t("选择合集")}</option>
            <optgroup label={t("内置合集")}>{collections.filter((item) => !item.id.startsWith('custom-')).map((item) => <option key={item.id} value={item.id}>{t('{name} · {count} 个', { name: item.name, count: item.extensions.length })}</option>)}</optgroup>
            {collections.some((item) => item.id.startsWith('custom-')) && <optgroup label={t("自定义合集")}>{collections.filter((item) => item.id.startsWith('custom-')).map((item) => <option key={item.id} value={item.id}>{t('{name} · {count} 个', { name: item.name, count: item.extensions.length })}</option>)}</optgroup>}
          </Select>
          <Button type="button" variant="secondary" disabled={!source} onClick={() => {
 setChosen(new Set(source.extensions));
            setCopiedExtensions(source.extensions);
            setQuery('');
            setExtensionPage(0);
            if (!name.trim()) setName(t('{name}副本', { name: source.name }).slice(0, 40));
          }}><CopyPlus size={15} />{t("复制扩展名")}</Button>
        </div>
      </div>}
      <div className="editor-heading"><label className="field-label" htmlFor="collection-filter">{t("扩展名")}</label><span>{t('已选 {count} 个', { count: chosen.size })}</span></div>
      <SearchField className="editor-search" id="collection-filter" value={query} onChange={(event) => { setQuery(event.target.value); setExtensionPage(0); }} placeholder={t("筛选扩展名")} />
      <div className="extension-grid">
        {canAdd && <Button variant="plain" type="button" className="chip" onClick={() => {
 setAdded((prev) => [...prev, proposed]);
          setCopiedExtensions((prev) => [proposed, ...prev]);
          setChosen((prev) => new Set([...prev, proposed]));
          setQuery('');
        }}><Plus size={13} />{t('添加 {extension}', { extension: proposed })}</Button>}
        {extensions.items.map((ext) => <Button variant="plain" type="button" key={ext} className={chosen.has(ext) ? 'chip chosen' : 'chip'} aria-pressed={chosen.has(ext)} onClick={() => setChosen((prev) => {
 const next = new Set(prev);
          if (next.has(ext)) next.delete(ext); else next.add(ext);
          return next;
        })}>{ext}</Button>)}
        {!matches.length && !canAdd && <span className="muted">{t("没有匹配的扩展名")}</span>}
      </div>
      {extensions.total > 32 && <Pagination page={extensions} onChange={setExtensionPage} label={t("合集扩展名分页")} compact />}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="modal-actions">
        {draft.id && (confirmDelete ? <Button type="button" variant="danger" onClick={() => {
 try { onDelete(); } catch (failure) { setError(t(friendlyError(failure))); }
        }}>{t("确认删除合集")}</Button> : <IconButton type="button" className="delete" aria-label={t("删除合集")} onClick={() => setConfirmDelete(true)}><Trash2 size={17} /></IconButton>)}
        <div className="spacer" />
        <Button type="button" variant="secondary" onClick={onClose}>{t("取消")}</Button>
        <Button type="submit" variant="primary" disabled={!name.trim() || !chosen.size}>{t("保存合集")}</Button>
      </div>
    </form>
  </Dialog>;
}

function AppPicker({ apps, appId, onSelect, onBrowse, onClose }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const visible = apps.filter((app) => (app.name + ' ' + app.id).toLowerCase().includes(query.trim().toLowerCase()));
  const page = usePage(visible, pageIndex, 12);
  return <Dialog title={t("选择目标应用")} onClose={onClose}>
    <SearchField className="picker-search" autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setPageIndex(0); }} aria-label={t("搜索应用")} placeholder={t("搜索应用名称")} />
    <div className="app-options">
      {page.items.map((app) => <Button variant="plain" key={app.id} className={'app-option' + (appId === app.id ? ' active' : '')} onClick={() => onSelect(app)}>
 <span className="app-glyph"><AppIcon app={app} size={24} /></span>
        <span className="option-label"><strong>{app.name}</strong><small>{t('{kind} · {count} 种格式', { kind: t(appKind[app.detail]), count: Object.keys(app.handlers).length })}</small></span>
        {appId === app.id ? <Check size={18} className="accent" /> : <ArrowRight size={16} className="option-arrow" />}
      </Button>)}
      {!visible.length && <p className="muted option-empty">{t("没有匹配的应用")}</p>}
    </div>
    {page.total > 12 && <Pagination page={page} onChange={setPageIndex} label={t("应用分页")} compact />}
    <div className="modal-actions"><Button variant="secondary" onClick={onBrowse}><FolderOpen size={16} />{t("浏览 .exe")}</Button></div>
  </Dialog>;
}

function ApplyDialog({ app, extensions, result, busy, onApply, onClose, onSettings }) {
  const { t } = useLanguage();
  const [resultPage, setResultPage] = useState(0);
  const [previewPage, setPreviewPage] = useState(0);
  const rows = result?.results || [];
  const failures = rows.filter((row) => row.status === 'failed');
  const success = rows.filter((row) => row.status === 'changed').length;
  const unchanged = rows.filter((row) => row.status === 'unchanged').length;
  const details = usePage(failuresFirst(rows), resultPage, 6);
  const preview = usePage(extensions, previewPage, 32);
  const title = busy ? t("正在更新默认应用") : result ? t("批量关联结果") : t("确认批量关联");
  return <Dialog title={title} onClose={onClose} busy={busy}>
    {result ? <>
      <div className={'result-summary' + (failures.length || result.error ? ' warning' : '')}>
        {failures.length || result.error ? <CircleAlert size={22} /> : <CheckCircle2 size={22} />}
        <div>{result.error ? <><strong>{t("未能完成关联")}</strong><p>{result.error}</p></> : <strong>{t('{changed} 个已应用 · {unchanged} 个已是默认 · {failed} 个未生效', { changed: success, unchanged, failed: failures.length })}</strong>}</div>
      </div>
      {!!rows.length && <div className="result-list">{details.items.map((row) => <div className="result-row" key={row.extension}>
        <code>{row.extension}</code><span className={row.status}>{t(statusLabel[row.status])}</span>
        {row.message && <small>{t(failureMessage(row))}</small>}
      </div>)}</div>}
      {details.total > 6 && <Pagination page={details} onChange={setResultPage} label={t("关联结果分页")} compact />}
      {result.historyWarning && <p role="alert" className="inline-error">{result.historyWarning}</p>}
    </> : <>
      <p className="modal-description">{t('将当前账户的 {count} 个扩展名关联到 {app}。', { count: extensions.length, app: app.name })}</p>
      <div className="apply-extensions">{preview.items.map((ext) => <code className="chip" key={ext}>{ext}</code>)}</div>
      {preview.total > 32 && <Pagination page={preview} onChange={setPreviewPage} label={t("待关联扩展名分页")} compact />}
      {busy && <p className="loading-line"><LoaderCircle size={16} className="spin" /> {t("正在写入并核对 Windows 返回的默认应用")}</p>}
    </>}
    <div className="modal-actions">
      {failures.some((row) => row.reason === 'windows') && <Button type="button" variant="secondary" onClick={onSettings}>{t("打开 Windows 设置")} <ArrowUpRight size={15} /></Button>}
      <div className="spacer" />
      {failures.length > 0 && <Button type="button" variant="secondary" disabled={busy} onClick={() => { setResultPage(0); onApply(failures.map((row) => row.extension)); }}>{t("重试失败项")}</Button>}
      {!busy && <Button variant={result ? 'primary' : 'secondary'} onClick={onClose}>{result ? t("完成") : t("取消")}</Button>}
      {!result && <Button variant="primary" onClick={() => onApply()} disabled={busy}>{busy ? t("应用中") : t("确认应用")}</Button>}
    </div>
  </Dialog>;
}

const restoreLabels = {
  missing: '未匹配应用', ready: '将恢复', changed: '已恢复', unchanged: '已是默认', failed: '未生效', skipped: '未选中',
};

function RestoreDialog({ data, result, busy, onRestore, onClose, onMap, onSettings, onSelect }) {
  const { t } = useLanguage();
  const [pageIndex, setPageIndex] = useState(0);
  const [source, setSource] = useState('');
  const results = new Map((result?.results || []).map((row) => [row.extension, row]));
  const selected = new Set(data.selection);
  const rows = result?.collectionsOnly ? [] : failuresFirst(data.rows.map((row) => ({
    ...row,
    ...(result?.results && row.status === 'ready' && !selected.has(row.extension) ? { status: 'skipped' } : null),
    ...results.get(row.extension),
  })));
  const ready = rows.filter((row) => row.status === 'ready');
  const groups = new Map();
  for (const row of rows.filter((item) => item.status === 'missing')) {
    const group = groups.get(row.source) || { name: row.backupName, count: 0 };
    group.count++;
    groups.set(row.source, group);
  }
  const sourceId = groups.has(source) ? source : groups.keys().next().value;
  const page = usePage(rows, pageIndex, 8);
  const count = (status) => rows.filter((row) => row.status === status).length;
  return <Dialog className="restore-dialog" title={result?.results ? t("迁移结果") : t("导入备份")} busy={busy} onClose={onClose}>
    <p className="modal-description">
      {t(result?.results ? '已合并 {count} 个自定义合集。' : '将合并 {count} 个自定义合集。', { count: data.collections.length })}{' '}
      {result?.results ? t('{changed} 项已恢复，{failed} 项未生效。', { changed: count('changed'), failed: count('failed') }) :
        t('已选 {selected} / {ready} 项可恢复关联。', { selected: selected.size, ready: ready.length })}
      {!result?.collectionsOnly && <> {' '}{t('{unchanged} 项已是默认，{missing} 项未匹配到本机应用。', { unchanged: count('unchanged'), missing: count('missing') })}</>}
    </p>
    {!result?.results && groups.size > 0 && <div className="restore-mapping">
      <Select aria-label={t("未匹配的原应用")} value={sourceId} onChange={(event) => setSource(event.target.value)}>
        {[...groups].map(([key, group]) => <option key={key} value={key}>{t('{name} · {count} 项', group)}</option>)}
      </Select>
      <Button variant="secondary" disabled={busy} onClick={() => onMap(sourceId)}>{t("匹配本机应用")}</Button>
    </div>}
    {!result?.results && data.mapping && <p className="modal-description" role="status">{t('{app} 已匹配 {mapped} 项，{unsupported} 项缺少此应用的处理程序。', { app: data.mapping.name, ...data.mapping })}</p>}
    {!result?.results && ready.length > 0 && <div className="migration-selection">
      <Button variant="secondary" disabled={busy || selected.size === ready.length} onClick={() => onSelect(ready.map((row) => row.extension))}>{t("全选可恢复项")}</Button>
      <Button variant="text" disabled={busy || !selected.size} onClick={() => onSelect([])}>{t("清空选择")}</Button>
    </div>}
    {!!rows.length && <div className="result-list migration-list">{page.items.map((row) => <div className="result-row migration-row migration-comparison" key={row.extension}>
      <div className="migration-extension">
        {!result?.results && <Checkbox aria-label={t('恢复 {extension}', row)} disabled={busy || row.status !== 'ready'} checked={selected.has(row.extension)}
          onChange={(event) => { if (event.target.checked) selected.add(row.extension); else selected.delete(row.extension); onSelect([...selected]); }} />}
        <code>{row.extension}</code>
      </div>
      <span className="migration-apps"><span title={row.currentName || t("未设置默认应用")}>{row.currentName || t("未设置默认应用")}</span>
        <ArrowRight size={14} aria-hidden="true" /><strong title={row.name}>{row.name}</strong></span>
      <span className={row.status}>{t(restoreLabels[row.status])}</span>
      {row.unsupportedBy && <small>{t('{app} 未注册此扩展名。', { app: row.unsupportedBy })}</small>}
      {row.message && <small>{t(failureMessage(row))}</small>}
    </div>)}</div>}
    {page.total > 8 && <Pagination page={page} onChange={setPageIndex} label={t("迁移详情分页")} compact />}
    {result?.error && <p className="inline-error" role="alert">{result.error}</p>}
    {result?.historyWarning && <p className="inline-error" role="alert">{result.historyWarning}</p>}
    <div className="modal-actions"><div className="spacer" />
      <Button variant="secondary" disabled={busy} onClick={onClose}>{result?.results ? t("完成") : t("取消")}</Button>
      {!result?.results && <Button variant="secondary" disabled={busy} onClick={() => onRestore('collections')}>{t("仅导入合集")}</Button>}
      {!result?.results && <Button variant="primary" disabled={busy || !selected.size} onClick={() => onRestore('all')}>{busy ? t("正在恢复") : t("导入并恢复")}</Button>}
      {rows.some((row) => row.reason === 'windows') && <Button variant="secondary" onClick={onSettings}>{t("打开 Windows 设置")}</Button>}
      {count('failed') > 0 && <Button variant="primary" disabled={busy} onClick={() => { setPageIndex(0); onRestore('retry'); }}>{t("重试失败项")}</Button>}
    </div>
  </Dialog>;
}

function App() {
  const { t, language } = useLanguage();
  const byName = useMemo(() => new Intl.Collator(language, { numeric: true }), [language]);
  const labelOf = useCallback((app) => app?.name || t("未设置"), [t]);
  const builtIns = useMemo(() => collectionDefinitions.map((item) => ({ ...item, name: t(item.name) })), [t]);
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [custom, setCustom] = useState(readCollections);
  const [groupId, setGroupId] = useState('all');
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState('');
  const [portable, setPortable] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [supportedOnly, setSupportedOnly] = useState(false);
  const [sort, setSort] = useState({ key: 'extension', direction: 1 });
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [version, setVersion] = useState('');
  const [appearance, setAppearance] = useState(readAppearance);
  const [transferBusy, setTransferBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const searchRef = useRef(null);
  const selectAllRef = useRef(null);
  const tableRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!api) throw new Error(t("请通过桌面程序启动文件关联管理器。"));
      const data = await api.catalog();
      setCatalog(data);
      setTarget((previous) => previous.startsWith('portable:') || data.apps.some((app) => app.id === previous) ? previous : '');
    } catch (failure) {
      setError(t(friendlyError(failure)));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void api?.version().then(setVersion).catch(() => {}); }, []);
  useEffect(() => {
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const root = document.documentElement;
    const update = () => {
      const { mode, palette } = appearance;
      root.dataset.theme = mode === 'system' ? (scheme.matches ? 'dark' : 'light') : mode;
      root.dataset.palette = palette;
      const colors = getComputedStyle(root);
      void api?.setTheme({
        color: colors.getPropertyValue('--window-bar').trim(),
        symbolColor: colors.getPropertyValue('--window-symbols').trim(),
      }).catch(() => {});
    };
    localStorage.setItem(appearanceKeys.mode, appearance.mode);
    localStorage.setItem(appearanceKeys.palette, appearance.palette);
    update();
    scheme.addEventListener('change', update);
    return () => scheme.removeEventListener('change', update);
  }, [appearance]);
  useEffect(() => {
    function onKey(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !modal) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  const apps = catalog?.apps || [];
  const types = useMemo(() => {
    const index = new Map((catalog?.types || []).map((type) => [type.extension, type]));
    for (const collection of custom) {
      for (const extension of collection.extensions) {
        if (!index.has(extension)) index.set(extension, { extension });
      }
    }
    return [...index.values()];
  }, [catalog, custom]);
  const appIndex = useMemo(() => new Map(apps.map((app) => [app.id, app])), [catalog]);
  const targetApp = portable?.id === target ? portable : appIndex.get(target);
  const group = [...builtIns, ...custom].find((item) => item.id === groupId) || builtIns[0];
  const typeIndex = useMemo(() => new Map(types.map((type) => [type.extension, type])), [types]);
  const counts = new Map([...builtIns, ...custom].map((item) => [item.id, item.extensions ? item.extensions.filter((ext) => typeIndex.has(ext)).length : types.length]));
  const visible = useMemo(() => {
    const included = group.extensions ? new Set(group.extensions) : null;
    const needle = query.trim().toLowerCase();
    return types.filter((type) => {
      if (included && !included.has(type.extension)) return false;
      if (supportedOnly && targetApp && !supports(targetApp, type.extension)) return false;
      return !needle || type.extension.includes(needle) || labelOf(appIndex.get(type.currentAppId)).toLowerCase().includes(needle);
    }).sort((a, b) => {
      const first = sort.key === 'extension' ? a.extension : labelOf(appIndex.get(a.currentAppId));
      const second = sort.key === 'extension' ? b.extension : labelOf(appIndex.get(b.currentAppId));
      return sort.direction * (byName.compare(first, second) || byName.compare(a.extension, b.extension));
    });
  }, [types, group, supportedOnly, targetApp, query, sort, appIndex, byName, labelOf]);
  const selectable = visible.filter((type) => !targetApp || supports(targetApp, type.extension));
  const selectedVisible = selectable.filter((type) => selected.has(type.extension)).length;
  const pageSize = useTablePageSize(tableRef);
  const tablePage = usePage(visible, page, pageSize);
  const displayed = tablePage.items;
  const eligibleSelection = [...selected].filter((ext) => supports(targetApp, ext)).sort();
  const selectedCount = targetApp ? eligibleSelection.length : selected.size;
  const preselected = [...selected].sort();

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedVisible > 0 && selectedVisible < selectable.length;
  }, [selectable.length, selectedVisible, loading]);

  function changeGroup(id) {
    setGroupId(id);
    setPage(0);
    setQuery('');
  }

  function toggleAll() {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const { extension } of selectable) {
        if (selectedVisible === selectable.length) next.delete(extension); else next.add(extension);
      }
      return next;
    });
  }

  function toggleExtension(ext) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(ext)) next.delete(ext); else next.add(ext);
      return next;
    });
  }

  function chooseApp(chosen) {
    setTarget(chosen.id);
    if (chosen.portable) setPortable(chosen);
    setSelected((previous) => new Set([...previous].filter((ext) => supports(chosen, ext))));
    setModal(null);
    setPage(0);
  }

  async function browseApp() {
    try {
      const chosen = await api.browse();
      if (chosen) chooseApp(chosen);
    } catch (failure) {
      setModal(null);
      setError(t(friendlyError(failure)));
    }
  }

  async function mapImport(chosen) {
    const { data, source } = modal;
    try {
      const mapping = await api.mapRestore(source, chosen.id);
      const previouslyReady = new Set(data.rows.filter((row) => row.status === 'ready').map((row) => row.extension));
      const newlyReady = mapping.rows.filter((row) => row.status === 'ready' && !previouslyReady.has(row.extension)).map((row) => row.extension);
      setResult(null);
      setModal({ kind: 'restore', data: { ...data, rows: mapping.rows, mapping, selection: [...data.selection, ...newlyReady] } });
    } catch (failure) {
      setResult({ error: t(friendlyError(failure)) });
      setModal({ kind: 'restore', data });
    }
  }

  async function browseImport() {
    try {
      const chosen = await api.browse();
      if (chosen) await mapImport(chosen);
    } catch (failure) {
      setResult({ error: t(friendlyError(failure)) });
      setModal({ kind: 'restore', data: modal.data });
    }
  }

  function updateCollection(name, extensions) {
    const id = modal.draft.id || 'custom-' + crypto.randomUUID();
    const item = { id, name, extensions, icon: customIcon };
    const next = modal.draft.id ? custom.map((old) => old.id === id ? item : old) : [...custom, item];
    saveCollections(next);
    setCustom(next);
    changeGroup(id);
    setModal(null);
  }

  function deleteCollection() {
    const id = modal.draft.id;
    const next = custom.filter((item) => item.id !== id);
    saveCollections(next);
    setCustom(next);
    if (groupId === id) changeGroup('all');
    setModal(null);
  }

  async function openSettings() {
    try { await api.windowsSettings(); } catch (failure) { setError(t(friendlyError(failure))); }
  }

  async function transfer(kind) {
    setNotice('');
    setError('');
    setTransferBusy(true);
    try {
      if (kind === 'export') {
        const exported = await api.exportBackup(custom.map(({ id, name, extensions }) => ({ id, name, extensions })));
        if (exported) setNotice(exported);
      } else {
        const data = await api.previewImport();
        if (data) {
          setResult(null);
          setModal({ kind: 'restore', data: { ...data, selection: data.rows.filter((row) => row.status === 'ready').map((row) => row.extension) } });
        }
      }
    } catch (failure) {
      setError(t(friendlyError(failure)));
    } finally {
      setTransferBusy(false);
    }
  }

  async function restore(mode) {
    if (busy) return;
    setBusy(true);
    try {
      if (mode !== 'retry') {
        const merged = new Map(custom.map((item) => [item.id, item]));
        for (const item of modal.data.collections) merged.set(item.id, { ...item, icon: customIcon });
        const next = [...merged.values()];
        saveCollections(next);
        setCustom(next);
      }
      const response = await api.restore(mode, modal.data.selection);
      setResult(mode === 'retry' ? mergeResults(result, response) : response);
      if (mode !== 'collections') await refresh();
    } catch (failure) {
      setResult({ ...(mode === 'retry' ? result : null), error: t(friendlyError(failure)) });
    } finally {
      setBusy(false);
    }
  }

  async function apply(extensions = modal.extensions) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await api.apply(modal.app.id, extensions);
      setResult(result?.results ? mergeResults(result, response) : response);
      const retry = response.results.filter((row) => row.status === 'failed').map((row) => row.extension);
      setSelected(new Set(retry));
      await refresh();
    } catch (failure) {
      setResult({ ...result, error: t(friendlyError(failure)) });
    } finally {
      setBusy(false);
    }
  }

  function openApply() {
    if (!targetApp || !eligibleSelection.length) return;
    setResult(null);
    setModal({ kind: 'apply', app: targetApp, extensions: eligibleSelection });
  }

  function changeSort(key) {
    setSort({ key, direction: sort.key === key ? -sort.direction : 1 });
    setPage(0);
  }

  function navItem(item) {
    const Icon = item.icon;
    return <Button variant="plain" key={item.id} className={'nav-item' + (groupId === item.id ? ' current' : '')}
 aria-current={groupId === item.id ? 'page' : undefined} onClick={() => changeGroup(item.id)}>
      <Icon size={17} /><span>{item.name}</span><small>{catalog ? counts.get(item.id) : '–'}</small>
    </Button>;
  }

  const GroupIcon = group.icon;
  return <div className="app-shell">
    <div className="titlebar"><Link2 size={15} /><span>{t("文件关联管理器")}</span></div>
    <div className="workspace">
      <aside className="sidebar" aria-label={t("扩展名合集")}>
        <nav className="collections">
          <div className="nav-label">{t("内置合集")}</div>
          {builtIns.map(navItem)}
          <div className="nav-label custom-label">{t("自定义合集")}
            <IconButton compact aria-label={t("新建合集")} title={t("新建合集")} onClick={() => setModal({ kind: 'collection', draft: { name: '', extensions: preselected } })}><Plus size={17} /></IconButton>
          </div>
          {custom.map(navItem)}
          {!custom.length && <Button variant="plain" className="create-collection" onClick={() => setModal({ kind: 'collection', draft: { name: '', extensions: preselected } })}><Plus size={15} />{t("新建合集")}</Button>}
        </nav>
        <Button variant="plain" className="settings-link" onClick={openSettings}><Monitor size={16} /> {t("Windows 默认应用")} <ArrowUpRight size={14} /></Button>
      </aside>
      <main className="main">
        <header className="page-head">
          <div className="title-row"><GroupIcon size={18} /><h1>{group.name}</h1>
            {group.id.startsWith('custom-') && <IconButton title={t("编辑合集")} aria-label={t("编辑合集")} onClick={() => setModal({ kind: 'collection', draft: group })}><Pencil size={15} /></IconButton>}
            {!group.id.startsWith('custom-') && group.extensions && <IconButton title={t("复制为自定义合集")} aria-label={t("复制为自定义合集")}
              onClick={() => setModal({ kind: 'collection', draft: { name: t('{name}副本', { name: group.name }).slice(0, 40), source: group.id, extensions: group.extensions } })}><CopyPlus size={16} /></IconButton>}
          </div>
          <div className="page-tools">
            {notice && <span className="transfer-notice" role="status">{t('已导出 {collections} 个合集和 {associations} 项关联', notice)}</span>}
            <Button variant="secondary" disabled={loading || busy || transferBusy || !catalog} onClick={() => transfer('export')}><Download size={15} />{t("导出")}</Button>
            <Button variant="secondary" disabled={busy || transferBusy} onClick={() => transfer('import')}><Upload size={15} />{t("导入")}</Button>
            <IconButton variant="secondary" aria-label={t("关联历史")} title={t("关联历史")} onClick={() => setModal({ kind: 'history' })}><History size={17} /></IconButton>
            <IconButton variant="secondary" aria-label={t("设置")} title={t("设置")} onClick={() => setModal({ kind: 'settings' })}><Settings size={17} /></IconButton>
            <IconButton variant="secondary" className="refresh" aria-label={t("刷新 Windows 关联")} title={t("刷新 Windows 关联")} disabled={loading || busy || transferBusy} onClick={refresh}><RefreshCw size={16} className={loading ? 'spin' : ''} /></IconButton>
          </div>
        </header>

        <section className="file-panel" aria-label={t("扩展名列表")}>
          <div className="table-toolbar">
            <SearchField ref={searchRef} value={query} aria-label={t("搜索扩展名或应用")} placeholder={t("搜索扩展名或当前应用")} onChange={(event) => { setQuery(event.target.value); setPage(0); }}
              shortcut="Ctrl K" onClear={() => { setQuery(''); setPage(0); searchRef.current?.focus(); }} />
            <div className="toolbar-right">
              {targetApp && !targetApp.portable && <label className="supported-toggle"><Checkbox checked={supportedOnly} onChange={(event) => { setSupportedOnly(event.target.checked); setPage(0); }} />{t("仅显示支持的格式")}</label>}
              <Button variant="plain" className="app-trigger" aria-label={targetApp ? t('目标应用：{app}', { app: targetApp.name }) : t("选择应用")} onClick={() => setModal({ kind: 'picker' })} disabled={!catalog || busy}>
 <AppIcon app={targetApp} size={17} /><span>{targetApp?.name || t("选择应用")}</span><ChevronDown size={15} />
              </Button>
            </div>
          </div>
          {error && <div className="banner" role="alert"><CircleAlert size={18} /><span>{error}</span><Button variant="secondary" onClick={refresh} disabled={loading}>{t("重试")}</Button></div>}
          <div className="table-scroll" ref={tableRef}>
            <table>
              <colgroup><col className="check-col" /><col className="ext-col" /><col /><col className="state-col" /></colgroup>
              <thead><tr>
                <th><Checkbox aria-label={t("选择当前筛选结果中的全部可选扩展名")} checked={!!selectable.length && selectedVisible === selectable.length} disabled={!selectable.length || busy} ref={selectAllRef} onChange={toggleAll} /></th>
                <th scope="col" aria-sort={sort.key === 'extension' ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none'}><Button variant="plain" onClick={() => changeSort('extension')}>{t("扩展名")} {sort.key === 'extension' && (sort.direction === 1 ? <ArrowDown size={13} /> : <ArrowUp size={13} />)}</Button></th>
                <th scope="col" aria-sort={sort.key === 'app' ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none'}><Button variant="plain" onClick={() => changeSort('app')}>{t("当前默认应用")} {sort.key === 'app' && (sort.direction === 1 ? <ArrowDown size={13} /> : <ArrowUp size={13} />)}</Button></th>
                <th scope="col">{targetApp ? t("目标应用状态") : t("状态")}</th>
              </tr></thead>
              <tbody>{displayed.map((type) => {
                const supported = !targetApp || supports(targetApp, type.extension);
                const isTarget = targetApp && type.currentAppId === targetApp.id;
                const checked = selected.has(type.extension);
                const current = appIndex.get(type.currentAppId);
                return <tr key={type.extension} className={checked ? 'selected-row' : ''}>
                  <td><Checkbox aria-label={t('选择 {extension}', type)} checked={checked} disabled={!supported || busy} onChange={() => toggleExtension(type.extension)} /></td>
                  <td><code className="extension">{type.extension}</code></td>
                  <td><span className={'current-app' + (current ? '' : ' muted')}><AppIcon app={current} size={16} />{labelOf(current)}</span></td>
                  <td><span className={'row-state ' + (isTarget ? 'is-target' : supported ? '' : 'unsupported')}><i />{isTarget ? t("已是默认") : targetApp ? supported ? t("可关联") : t("未注册支持") : current ? t("已关联") : t("未设置")}</span></td>
                </tr>;
              })}</tbody>
            </table>
            {!displayed.length && <div className="empty">
              {loading ? <LoaderCircle size={27} className="spin" /> : <FileQuestion size={30} />}
              <strong>{loading ? t("正在读取 Windows 文件关联") : error ? t("暂时无法读取扩展名") : t("没有匹配的扩展名")}</strong>
              {!loading && !error && <span>{supportedOnly && targetApp ? t("可关闭「仅显示支持的格式」查看全部结果。") : t("试试其他搜索词或切换合集。")}</span>}
            </div>}
          </div>
          <Pagination page={tablePage} onChange={setPage} label={t("扩展名分页")} />
        </section>

        <footer className="action-bar">
          <span className="selection-summary"><Files size={18} /><strong>{t('已选 {count} 个', { count: selectedCount })}</strong></span>
          {!!selectedCount && <Button variant="text" onClick={() => setSelected(new Set())}>{t("清空")}</Button>}
          <div className="spacer" />
          {!!selectedCount && <Button variant="secondary" className="save-selection" onClick={() => setModal({ kind: 'collection', draft: { name: '', extensions: targetApp ? eligibleSelection : preselected } })}><Plus size={16} />{t("保存为合集")}</Button>}
          <Button variant="primary" onClick={openApply} disabled={loading || busy || !targetApp || !eligibleSelection.length}>{t("应用关联")} <ArrowRight size={17} /></Button>
        </footer>
      </main>
    </div>
    {modal?.kind === 'settings' && <Dialog className="settings-modal" title={t("设置")} onClose={() => setModal(null)}>
      <AppearanceSettings appearance={appearance} onChange={setAppearance} />
      {version && <p className="settings-version">{t('文件关联管理器 v{version}', { version })}</p>}
    </Dialog>}
    {modal?.kind === 'history' && <HistoryDialog api={api} onClose={() => setModal(null)} onChange={refresh} onSettings={openSettings} describeError={friendlyError} />}
    {modal?.kind === 'picker' && <AppPicker apps={apps} appId={target} onSelect={chooseApp} onBrowse={browseApp} onClose={() => setModal(null)} />}
    {modal?.kind === 'map-import' && <AppPicker apps={apps.filter((app) => modal.data.rows.some((row) => row.source === modal.source && supports(app, row.extension)))} onSelect={mapImport} onBrowse={browseImport} onClose={() => setModal({ kind: 'restore', data: modal.data })} />}
    {modal?.kind === 'collection' && <CollectionEditor draft={modal.draft} types={types} collections={[...builtIns.filter((item) => item.extensions), ...custom]} onClose={() => setModal(null)} onSave={updateCollection} onDelete={deleteCollection} />}
    {modal?.kind === 'apply' && <ApplyDialog app={modal.app} extensions={modal.extensions} result={result} busy={busy} onApply={apply} onClose={() => setModal(null)} onSettings={openSettings} />}
    {modal?.kind === 'restore' && <RestoreDialog data={modal.data} result={result} busy={busy} onRestore={restore} onClose={() => setModal(null)} onSettings={openSettings}
      onSelect={(selection) => setModal((previous) => ({ ...previous, data: { ...previous.data, selection } }))}
      onMap={(source) => setModal({ ...modal, kind: 'map-import', source })} />}
  </div>;
}

createRoot(document.getElementById('root')).render(<LanguageProvider><App /></LanguageProvider>);
